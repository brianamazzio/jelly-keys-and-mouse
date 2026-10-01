import * as THREE from 'three'
import { caseVertexPars, itemVertexPars, keycapVertexPars, mouseVertexPars } from './shaders'

export type JellyKind = 'keycap' | 'case' | 'mouse' | 'item'

const PARS: Record<JellyKind, string> = { keycap: keycapVertexPars, case: caseVertexPars, mouse: mouseVertexPars, item: itemVertexPars }
const FN: Record<JellyKind, string> = { keycap: 'keycapDeform', case: 'caseDeform', mouse: 'mouseDeform', item: 'itemDeform' }

/**
 * Injects the analytic jelly displacement into any three.js material's vertex stage.
 * Works for MeshPhysicalMaterial (lit pass) and MeshDepthMaterial (shadow pass) so shadows follow the deformation.
 * Depth shaders only include <beginnormal_vertex> behind an #ifdef, so <begin_vertex> always evaluates the
 * displacement itself (the extra evaluations are trivial for the GPU and keep every shader variant valid).
 */
/**
 * Translucency glow: light scattered inside gelatin. Real jelly glows most where it is thin (rims, edges,
 * thin walls) and where light comes through from behind, and stays deep and dark in thick middles. Without
 * this, every object sat at one brightness and hue and the objects blurred into each other.
 * Values are linear-light; tuned for the Neutral tone mapping.
 */
export const JELLY_GLOW = {
  /** scattered light colour: warmer and brighter than the body, so thin parts read red-orange and luminous */
  color: new THREE.Color('#ff1f1f'),
  /** direction the studio's rim light comes from (behind the room, high) */
  backDir: new THREE.Vector3(0.6, 1.1, -2.6).normalize(),
  backColor: new THREE.Color('#ff4040'),
}

/** Fragment half of the jelly look, shared by deforming and static jelly. */
function patchJellyFragment(shader: THREE.WebGLProgramParametersWithUniforms, hasThickVarying: boolean, material: THREE.Material) {
  const amount = (material.userData.jellyGlow as number | undefined) ?? 1
  shader.uniforms.uJellyGlow = { value: amount }
  shader.uniforms.uJellyGlowColor = { value: JELLY_GLOW.color }
  shader.uniforms.uJellyBackDir = { value: JELLY_GLOW.backDir }
  shader.uniforms.uJellyBackColor = { value: JELLY_GLOW.backColor }
  const thick = hasThickVarying ? 'vJellyThick' : '1.0'
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
${hasThickVarying ? 'varying float vJellyThick;' : ''}
uniform float uJellyGlow;
uniform vec3 uJellyGlowColor;
uniform vec3 uJellyBackDir;
uniform vec3 uJellyBackColor;`,
    )
    // Optical thickness for transmission, per pixel:
    //  - vJellyThick: the shape's own variation (thick cap centres, thin chamfers, thinner where dented)
    //  - facing: light crossing a solid body travels far through the middle and barely at all at the
    //    silhouette, so rims stay clear and cores deepen, the way a real block of gelatin reads.
    // Chunks are still #include placeholders at this point, so the transmission chunk is expanded first.
    .replace(
      '#include <transmission_fragment>',
      THREE.ShaderChunk.transmission_fragment.replace(
        'material.thickness = thickness;',
        `float jellyFacing = abs(dot(normal, normalize(vViewPosition)));
         material.thickness = thickness * ${thick} * (0.12 + 0.88 * pow(jellyFacing, 0.8));`,
      ),
    )
    .replace(
      '#include <opaque_fragment>',
      `{
        vec3 jV = normalize(vViewPosition);
        float jThin = 1.0 - abs(dot(normal, jV));
        // scattered glow: a little everywhere, strongest at thin rims and thin parts
        vec3 jGlow = uJellyGlowColor * (0.05 + 0.55 * pow(jThin, 1.8)) / max(${thick}, 0.35);
        // light from behind passing through toward the camera
        vec3 jL = normalize((viewMatrix * vec4(uJellyBackDir, 0.0)).xyz);
        float jBack = pow(clamp(dot(jV, -normalize(jL + normal * 0.45)), 0.0, 1.0), 3.0);
        jGlow += uJellyBackColor * jBack * 0.6;
        outgoingLight += jGlow * uJellyGlow;
      }
      #include <opaque_fragment>`,
    )
}

/** A lit screen inside a static jelly object: object-space rectangle (x/y, on front faces facing +z). */
export interface JellyScreen { min: [number, number]; max: [number, number]; map: THREE.Texture; intensity: number }

/** Jelly look for static (non-deforming) jelly: furniture, decor, the desk, the monitor. */
export function patchJellyStatic(material: THREE.Material, screen?: JellyScreen) {
  material.onBeforeCompile = (shader) => {
    patchJellyFragment(shader, false, material)
    if (!screen) return
    // the monitor's screen: front faces inside the bezel show the screen texture, evenly lit
    shader.uniforms.uScreenMin = { value: new THREE.Vector2(...screen.min) }
    shader.uniforms.uScreenMax = { value: new THREE.Vector2(...screen.max) }
    shader.uniforms.uScreenMap = { value: screen.map }
    shader.uniforms.uScreenIntensity = { value: screen.intensity }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJellyObjPos;\nvarying vec3 vJellyObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJellyObjPos = position;\nvJellyObjN = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vJellyObjPos;
varying vec3 vJellyObjN;
uniform vec2 uScreenMin;
uniform vec2 uScreenMax;
uniform sampler2D uScreenMap;
uniform float uScreenIntensity;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 sUv = (vJellyObjPos.xy - uScreenMin) / (uScreenMax - uScreenMin);
          float inside = step(0.0, sUv.x) * step(sUv.x, 1.0) * step(0.0, sUv.y) * step(sUv.y, 1.0);
          float front = smoothstep(0.85, 0.97, normalize(vJellyObjN).z);
          // evenly lit, like a real display; only a thin inner shadow where the panel meets the bezel
          vec2 edgeDist = min(sUv, 1.0 - sUv) * (uScreenMax - uScreenMin);
          float edge = smoothstep(0.0, 0.006, min(edgeDist.x, edgeDist.y));
          vec3 sCol = texture2D(uScreenMap, clamp(sUv, 0.0, 1.0)).rgb * (0.6 + 0.4 * edge);
          outgoingLight = mix(outgoingLight, sCol * uScreenIntensity, inside * front * 0.9);
        }
        #include <opaque_fragment>`,
      )
  }
  // bump the version when the injected GLSL changes: three.js reuses compiled programs by this key, so a
  // running page would otherwise keep drawing the old shader after a hot reload
  material.customProgramCacheKey = () => (screen ? 'jelly-static-screen-v3' : 'jelly-static-v3')
  material.needsUpdate = true
}

export function patchJellyShader(material: THREE.Material, kind: JellyKind, uniforms: Record<string, THREE.IUniform>) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS[kind]}`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3(normal);
vec3 jellyPosN;
${FN[kind]}(position, objectNormal, jellyPosN, objectNormal);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 jellyN = vec3(normal);
vec3 transformed;
${FN[kind]}(position, jellyN, transformed, jellyN);`,
      )
    patchJellyFragment(shader, true, material)
  }
  if (!THREE.ShaderChunk.transmission_fragment.includes('material.thickness = thickness;')) {
    console.warn('jelly: three.js transmission chunk changed; per-pixel jelly thickness is off')
  }
  material.customProgramCacheKey = () => `jelly-${kind}`
  material.needsUpdate = true
}

/** The one considered palette: cranberry jelly throughout, on a warm bone desk. Legends are ivory ink suspended in the volume. */
export const PALETTE = {
  // vibrant red surface tint, so even the thinnest jelly (keycap walls, pens) stays saturated red;
  // attenuation through the volume deepens it further toward the thick middles
  jelly: new THREE.Color('#ff2a3a'),
  jellyDeep: new THREE.Color('#c4002c'),
  legend: new THREE.Color('#fbeee4'),
  desk: new THREE.Color('#e7e0d3'),
  /** room shell (walls, floor): the same red jelly in bulk */
  room: new THREE.Color('#cc102c'),
  /** the deep red glow of light scattered inside a thick block of red jelly */
  roomGlow: new THREE.Color('#5c000e'),
  /** tint of the light that makes it through the jelly onto the desk */
  shadow: new THREE.Color('#5e1426'),
}

export function makeJellyMaterial(opts: { thickness: number; map?: THREE.Texture | null; color?: THREE.Color }) {
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? PALETTE.jelly,
    map: opts.map ?? null,
    // clear, set gelatin: almost no internal cloud, all light transmitted, colour that builds with
    // thickness (thin edges nearly clear, thick middles deep red) instead of saturating within a millimetre
    roughness: 0.07,
    metalness: 0,
    transmission: 1,
    ior: 1.34,
    thickness: opts.thickness,
    attenuationColor: PALETTE.jellyDeep,
    attenuationDistance: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    specularIntensity: 1,
    sheen: 0.06,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ff5a78'),
    envMapIntensity: 1.2,
    side: THREE.FrontSide,
  })
}

/**
 * The same jelly for the bulk parts (keyboard case, mouse body, band, wheel housing, desk slab). These are
 * much thicker than a keycap wall, so they carry a larger optical thickness and read deeper and richer,
 * which is what a solid block of the same gelatin would do.
 */
export function makeBodyJellyMaterial(opts: { thickness: number; depth?: number }) {
  const m = makeJellyMaterial({ thickness: opts.thickness })
  // a whisper of cloud in the big volumes, still clearly see-through
  m.roughness = 0.12
  m.attenuationDistance = opts.depth ?? 0.07
  return m
}
