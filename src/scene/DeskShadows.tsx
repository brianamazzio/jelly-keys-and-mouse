import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

/** Meshes that should drop a contact shadow on the desk enable this layer. */
export const SHADOW_LAYER = 1
/** ref callback: `<mesh ref={castsDeskShadow} />` */
export const castsDeskShadow = (o: THREE.Object3D | null) => { o?.layers.enable(SHADOW_LAYER) }
const BELOW = 0.02

/**
 * Soft contact shadows on the desk top. An orthographic camera under the surface looks up, everything
 * within `far` is drawn with a depth material (nearer = darker) into a texture, and the desk-sized quad
 * that displays it blurs while sampling (7x7 Gaussian).
 *
 * This replaces drei's ContactShadows, which misbehaved here: the post-processing composer leaves
 * renderer.autoClear off, so its render target was never wiped and every past frame piled up (ghost
 * shadows where objects used to be, comb-like edges). Here the target is cleared explicitly, and the blur
 * needs no extra render passes.
 */
export function DeskShadows(props: { position: [number, number, number]; size: [number, number]; far: number; blur: number; opacity: number; color: THREE.Color; resolution?: number }) {
  const { position, size, far, blur, opacity, color, resolution = 1024 } = props
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const group = useRef<THREE.Group>(null)
  const cam = useRef<THREE.OrthographicCamera>(null)

  const r = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, Math.round((resolution * size[1]) / size[0]))
    target.texture.generateMipmaps = false
    const plane = new THREE.PlaneGeometry(size[0], size[1]).rotateX(Math.PI / 2)
    const depth = new THREE.MeshDepthMaterial()
    depth.depthTest = depth.depthWrite = false
    depth.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( vec3( 0.0 ), 1.0 - fragCoordZ );')
    }
    const display = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        tShadow: { value: target.texture },
        uStep: { value: new THREE.Vector2(blur / 3 / size[0], blur / 3 / size[1]) }, // blur = radius in metres
        uColor: { value: color },
        uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tShadow;
        uniform vec2 uStep;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float a = 0.0, wsum = 0.0;
          for (int i = -3; i <= 3; i++) {
            for (int j = -3; j <= 3; j++) {
              float w = exp(-float(i * i + j * j) / 4.5);
              a += w * texture2D(tShadow, vUv + vec2(float(i), float(j)) * uStep).a;
              wsum += w;
            }
          }
          a /= wsum;
          gl_FragColor = vec4(uColor * 0.35, a * uOpacity);
        }
      `,
    })
    return { target, plane, depth, display }
  }, [resolution, size, color, blur, opacity])

  const clearColor = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const c = cam.current, g = group.current
    if (!c || !g) return
    c.layers.set(SHADOW_LAYER)
    const bg = scene.background, om = scene.overrideMaterial
    gl.getClearColor(clearColor)
    const clearAlpha = gl.getClearAlpha()
    g.visible = false
    scene.background = null
    scene.overrideMaterial = r.depth
    gl.setRenderTarget(r.target)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(scene, c)
    gl.setRenderTarget(null)
    gl.setClearColor(clearColor, clearAlpha)
    scene.overrideMaterial = om
    scene.background = bg
    g.visible = true
  })

  return (
    <group ref={group} position={position} rotation-x={Math.PI / 2}>
      <mesh geometry={r.plane} material={r.display} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      {/* the camera starts a little under the desk top so object undersides are not clipped by its near
          plane, and it only sees SHADOW_LAYER, so the desk itself is not in the way */}
      <orthographicCamera
        ref={cam}
        position={[0, 0, BELOW]}
        args={[-size[0] / 2, size[0] / 2, size[1] / 2, -size[1] / 2, 0, far + BELOW]}
      />
    </group>
  )
}
