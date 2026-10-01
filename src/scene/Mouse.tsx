import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { MouseSim } from '../jelly/mouseSim'
import { makeBodyJellyMaterial, makeJellyMaterial, patchJellyShader } from '../jelly/jellyMaterial'
import { useUI } from '../store'
import { castsDeskShadow } from './DeskShadows'

const MODEL = '/models/mouse.glb'
const WHEEL_SCALE = 1.3
const WHEEL_LIFT = 0.0012
useGLTF.preload(MODEL)

export function Mouse(props: { position?: [number, number, number]; rotation?: [number, number, number] }) {
  const { nodes } = useGLTF(MODEL) as unknown as { nodes: Record<string, THREE.Mesh> }
  const sim = useMemo(() => new MouseSim(), [])
  const shellRef = useRef<THREE.Mesh>(null)
  const wheelRef = useRef<THREE.Mesh>(null)
  const touch = useUI((s) => s.touch)

  const shellGeom = useMemo(() => {
    const g = nodes.shell.geometry
    g.computeBoundingBox()
    return g
  }, [nodes])
  const bounds = shellGeom.boundingBox!

  const uniforms = useMemo(
    () => ({
      uLeft: { value: new THREE.Vector4(0, 0, 0, 0) },
      uRight: { value: new THREE.Vector4(0, 0, 0, 0) },
      uClick: { value: new THREE.Vector4(0, 0, 0, 0) },
      uWobble: { value: new THREE.Vector3() },
      uBounds: { value: new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.y) },
      uDent: { value: 0.0046 },
    }),
    [bounds],
  )

  const shellMaterial = useMemo(() => {
    const m = makeJellyMaterial({ thickness: 0.02 })
    m.attenuationDistance = 0.016
    patchJellyShader(m, 'mouse', uniforms)
    return m
  }, [uniforms])
  const shellDepth = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchJellyShader(m, 'mouse', uniforms)
    return m
  }, [uniforms])
  const wheelMaterial = useMemo(() => {
    const m = makeJellyMaterial({ thickness: 0.004 })
    m.roughness = 0.22
    return m
  }, [])
  // rigid lower body and band: same gelatin, thicker volumes. The band is a hair denser so the
  // product's part lines still read even though everything is one material.
  // lower body, band and wheel housing: same gelatin, thicker volumes, and they deform with the shell
  // (one displacement function for every part keeps the seams closed). The band is a hair denser so the
  // product's part lines still read even though everything is one material.
  const bodyMaterial = useMemo(() => {
    const m = makeBodyJellyMaterial({ thickness: 0.024, depth: 0.018 })
    patchJellyShader(m, 'mouse', uniforms)
    return m
  }, [uniforms])
  const bandMaterial = useMemo(() => {
    const m = makeBodyJellyMaterial({ thickness: 0.02, depth: 0.009 })
    patchJellyShader(m, 'mouse', uniforms)
    return m
  }, [uniforms])
  const housingMaterial = useMemo(() => {
    const m = makeBodyJellyMaterial({ thickness: 0.006 })
    patchJellyShader(m, 'mouse', uniforms)
    return m
  }, [uniforms])

  const wheelBase = useMemo(() => nodes.wheel.position.clone(), [nodes])
  const groupRef = useRef<THREE.Group>(null)
  useEffect(() => { groupRef.current?.traverse(castsDeskShadow) }, [])


  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __jelly?: Record<string, unknown> }
    w.__jelly = { ...(w.__jelly ?? {}), mouse: sim, mouseShell: shellRef }
  }, [sim])

  useFrame((_, dt) => {
    sim.update(dt)
    const u = uniforms
    u.uLeft.value.set(sim.left.dent.x, sim.left.touch.x, sim.left.touch.y, sim.left.touch.z)
    u.uRight.value.set(sim.right.dent.x, sim.right.touch.x, sim.right.touch.y, sim.right.touch.z)
    u.uClick.value.set(sim.left.click.x, sim.right.click.x, sim.squeeze.x, 0)
    u.uWobble.value.set(sim.wob[0].x, sim.wob[1].x, sim.wob[2].x)
    const w = wheelRef.current
    if (w) {
      const c = Math.max(sim.wheelComp.x, -0.2)
      w.rotation.x = -sim.wheelAngle
      // the found wheel is a small nub; it is grown a little and lifted so the jelly wheel is readable
      w.scale.set(WHEEL_SCALE * (1 + c * 0.22), WHEEL_SCALE * (1 - c * 0.28), WHEEL_SCALE * (1 - c * 0.1))
      // the wheel rides the same body wobble as the shell around it
      const hAll = (wheelBase.y + WHEEL_LIFT) / bounds.max.y
      const click = (sim.left.click.x + sim.right.click.x) * 0.0006 * hAll
      w.position.set(
        wheelBase.x + sim.wob[0].x * hAll,
        wheelBase.y + WHEEL_LIFT - c * 0.0011 + sim.wob[1].x * hAll - click,
        wheelBase.z + sim.wob[2].x * hAll,
      )
    }
  })

  /* ---------------------------------------------------------------- interaction */
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const local = (e: ThreeEvent<PointerEvent>) => shellRef.current!.worldToLocal(tmp.copy(e.point)).clone()
  const sideOf = (button: number) => (button === 2 ? 'right' : 'left')

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.button === 1) { sim.scroll(60); return }
    sim.pressButton(sideOf(e.button), local(e))
    touch('mouse')
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons & 1) sim.moveButton('left', local(e))
    if (e.buttons & 2) sim.moveButton('right', local(e))
  }
  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    sim.scroll(e.deltaY)
    touch('mouse')
  }
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (e.button === 0) sim.releaseButton('left')
      if (e.button === 2) sim.releaseButton('right')
    }
    const cancel = () => sim.releaseAll()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [sim])

  return (
    <group ref={groupRef} position={props.position} rotation={props.rotation}>
      <mesh
        ref={shellRef}
        geometry={shellGeom}
        material={shellMaterial}
        customDepthMaterial={shellDepth}
        castShadow
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
        onContextMenu={(e) => e.nativeEvent.preventDefault()}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      {/* the whole mouse is pressable: grabbing the body or band squeezes it like the shell */}
      <mesh geometry={nodes.body.geometry} material={bodyMaterial} customDepthMaterial={shellDepth} castShadow receiveShadow
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onWheel={onWheel} onContextMenu={(e) => e.nativeEvent.preventDefault()} />
      <mesh geometry={nodes.band.geometry} material={bandMaterial} customDepthMaterial={shellDepth} castShadow receiveShadow
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onWheel={onWheel} onContextMenu={(e) => e.nativeEvent.preventDefault()} />
      <mesh geometry={nodes.wheel_housing.geometry} material={housingMaterial} customDepthMaterial={shellDepth} />
      <mesh
        ref={wheelRef}
        geometry={nodes.wheel.geometry}
        material={wheelMaterial}
        position={[wheelBase.x, wheelBase.y + WHEEL_LIFT, wheelBase.z]}
        scale={WHEEL_SCALE}
        castShadow
        onWheel={onWheel}
        onPointerDown={(e) => { e.stopPropagation(); sim.scroll(90); touch('mouse') }}
        onContextMenu={(e) => e.nativeEvent.preventDefault()}
      />
    </group>
  )
}
