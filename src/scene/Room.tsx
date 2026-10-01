import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { makeBodyJellyMaterial, PALETTE } from '../jelly/jellyMaterial'
import { castsDeskShadow } from './DeskShadows'

/**
 * The room. Furniture and wall decor are found models (Poly Haven, CC0) in the same jelly.
 * The shell (floor and three walls) is the only generated geometry: plain boxes, since a room has no
 * "found model". It uses an opaque version of the jelly so that everything translucent in the room has
 * something of the same material to refract.
 */
export const DESK = { x: 0.1, z: -0.145, w: 2.0, d: 0.9472, h: 0.7875 }
const FLOOR_Y = -DESK.h
const ROOM = { minX: -1.62, maxX: 2.78, backZ: -0.66, frontZ: 1.5, top: 1.55 }

interface Prop { model: string; position: [number, number, number]; rotation?: [number, number, number]; collide?: boolean; thickness?: number; depth?: number }
const PROPS: Prop[] = [
  { model: 'desk', position: [DESK.x, FLOOR_Y, DESK.z], collide: true, thickness: 0.03, depth: 0.02 },
  { model: 'desklamp', position: [-0.72, 0, -0.44], rotation: [0, 1.9, 0], collide: true, thickness: 0.012 },
  { model: 'chair', position: [1.72, FLOOR_Y, 0.55], rotation: [0, -2.3, 0], collide: true, thickness: 0.03 },
  { model: 'bookshelf', position: [2.02, FLOOR_Y, ROOM.backZ + 0.3], collide: true, thickness: 0.03 },
  { model: 'floorplant', position: [-1.28, FLOOR_Y, -0.3], rotation: [0, 0.7, 0], collide: true, thickness: 0.02 },
  { model: 'ceilinglamp', position: [-0.62, ROOM.top, 0.05], thickness: 0.03 },
  { model: 'wallclock', position: [0.3, 0.5, ROOM.backZ + 0.026], thickness: 0.02 },
  { model: 'wideframe', position: [-0.5, 0.5, ROOM.backZ + 0.012], thickness: 0.012 },
  { model: 'tallframe', position: [1.0, 0.56, ROOM.backZ + 0.008], thickness: 0.01 },
  { model: 'dartboard', position: [-1.2, 0.55, ROOM.backZ + 0.022], thickness: 0.02 },
]
for (const p of PROPS) useGLTF.preload(`/models/items/${p.model}.glb`)

function StaticProp({ def }: { def: Prop }) {
  const { scene } = useGLTF(`/models/items/${def.model}.glb`)
  const geometry = useMemo(() => {
    let g: THREE.BufferGeometry | null = null
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry })
    return g as unknown as THREE.BufferGeometry
  }, [scene])
  const material = useMemo(() => makeBodyJellyMaterial({ thickness: def.thickness ?? 0.02, depth: def.depth }), [def])
  const mesh = <mesh geometry={geometry} material={material} castShadow ref={def.model === 'desk' ? undefined : castsDeskShadow} />
  if (!def.collide) return <group position={def.position} rotation={def.rotation}>{mesh}</group>
  return (
    <RigidBody type="fixed" colliders="trimesh" position={def.position} rotation={def.rotation} restitution={0.45} friction={0.9}>
      {mesh}
    </RigidBody>
  )
}

function Shell() {
  // opaque "bulk jelly": same hue, glossy skin, soft sheen. Not transmissive on purpose (see file header).
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: PALETTE.room, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9fb0'), envMapIntensity: 0.9 }),
    [],
  )
  const w = ROOM.maxX - ROOM.minX, d = ROOM.frontZ - ROOM.backZ, h = ROOM.top - FLOOR_Y
  const cx = (ROOM.minX + ROOM.maxX) / 2, cz = (ROOM.backZ + ROOM.frontZ) / 2, cy = (ROOM.top + FLOOR_Y) / 2
  const t = 0.1
  return (
    <RigidBody type="fixed" colliders={false} restitution={0.5} friction={0.9}>
      {/* floor, back wall, left wall, right wall */}
      <mesh position={[cx, FLOOR_Y - t / 2, cz]} material={mat} receiveShadow><boxGeometry args={[w + 2 * t, t, d + 2 * t]} /></mesh>
      <mesh position={[cx, cy, ROOM.backZ - t / 2]} material={mat} receiveShadow><boxGeometry args={[w + 2 * t, h, t]} /></mesh>
      <mesh position={[ROOM.minX - t / 2, cy, cz]} material={mat} receiveShadow><boxGeometry args={[t, h, d]} /></mesh>
      <mesh position={[ROOM.maxX + t / 2, cy, cz]} material={mat} receiveShadow><boxGeometry args={[t, h, d]} /></mesh>
      <CuboidCollider position={[cx, FLOOR_Y - t / 2, cz]} args={[w / 2 + t, t / 2, d / 2 + t]} />
      <CuboidCollider position={[cx, cy, ROOM.backZ - t / 2]} args={[w / 2 + t, h / 2, t / 2]} />
      <CuboidCollider position={[ROOM.minX - t / 2, cy, cz]} args={[t / 2, h / 2, d / 2]} />
      <CuboidCollider position={[ROOM.maxX + t / 2, cy, cz]} args={[t / 2, h / 2, d / 2]} />
      {/* invisible: the open side toward the camera, and a ceiling, so nothing can be thrown out of the room */}
      <CuboidCollider position={[cx, cy, ROOM.frontZ + t / 2]} args={[w / 2 + t, h / 2, t / 2]} />
      <CuboidCollider position={[cx, ROOM.top + t / 2, cz]} args={[w / 2 + t, t / 2, d / 2 + t]} />
    </RigidBody>
  )
}

export function Room() {
  return (
    <>
      <Shell />
      {PROPS.map((p) => (
        <StaticProp key={p.model} def={p} />
      ))}
    </>
  )
}
