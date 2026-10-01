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
  }
  material.customProgramCacheKey = () => `jelly-${kind}`
  material.needsUpdate = true
}

/** The one considered palette: cranberry jelly throughout, on a warm bone desk. Legends are ivory ink suspended in the volume. */
export const PALETTE = {
  jelly: new THREE.Color('#d8244f'),
  jellyDeep: new THREE.Color('#7a0c2a'),
  legend: new THREE.Color('#fbeee4'),
  desk: new THREE.Color('#e7e0d3'),
  /** room shell (walls, floor): the same jelly seen in bulk, so deeper and opaque */
  room: new THREE.Color('#b51d42'),
  /** tint of the light that makes it through the jelly onto the desk */
  shadow: new THREE.Color('#5e1426'),
}

export function makeJellyMaterial(opts: { thickness: number; map?: THREE.Texture | null; color?: THREE.Color }) {
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? PALETTE.jelly,
    map: opts.map ?? null,
    roughness: 0.3,
    metalness: 0,
    transmission: 0.86,
    ior: 1.36,
    thickness: opts.thickness,
    attenuationColor: PALETTE.jellyDeep,
    attenuationDistance: 0.012,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    specularIntensity: 1,
    sheen: 0.3,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ff9fb0'),
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
  // a touch more cloud in the big volumes so they read as gelatin, not tinted glass
  m.roughness = 0.34
  if (opts.depth !== undefined) m.attenuationDistance = opts.depth
  return m
}
