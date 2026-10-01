import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import { makeJellyMaterial, patchJellyShader } from '../jelly/jellyMaterial'
import { useUI } from '../store'
import { castsDeskShadow } from './DeskShadows'

/** Loose desk objects. `at` is x/z on the desk; `rot` lays some of them down. All models are found assets. */
interface ItemDef { id: string; model: string; at: [number, number]; rot?: [number, number, number]; lift?: number }

const HALF_PI = Math.PI / 2
export const ITEMS: ItemDef[] = [
  // back row
  { id: 'cat', model: 'cat', at: [-0.78, -0.22], rot: [0, 0.6, 0] },
  { id: 'book_a', model: 'book_a', at: [-0.43, -0.3], rot: [0, 0.25, HALF_PI], lift: 0 },
  { id: 'book_b', model: 'book_b', at: [-0.425, -0.3], rot: [0, 0.1, HALF_PI], lift: 0.034 },
  { id: 'book_c', model: 'book_c', at: [-0.43, -0.295], rot: [0, 0.4, HALF_PI], lift: 0.054 },
  { id: 'vase', model: 'vase', at: [-0.26, -0.37] },
  { id: 'thermos', model: 'thermos', at: [-0.13, -0.33], rot: [0, -0.5, 0] },
  { id: 'succulent', model: 'succulent', at: [0.02, -0.35] },
  { id: 'alarmclock', model: 'alarmclock', at: [0.18, -0.3], rot: [0, -0.2, 0] },
  { id: 'frame', model: 'frame', at: [0.35, -0.35], rot: [0, -1.2, 0] },
  { id: 'teapot', model: 'teapot', at: [0.54, -0.3], rot: [0, 0.5, 0] },
  { id: 'teacup_a', model: 'teacup', at: [0.68, -0.2], rot: [0, 1.0, 0] },
  { id: 'teacup_b', model: 'teacup', at: [0.66, -0.42], rot: [0, -0.7, 0] },
  { id: 'gnome', model: 'gnome', at: [0.84, -0.36], rot: [0, -0.4, 0] },
  // middle
  { id: 'goblet', model: 'goblet', at: [-0.5, -0.12] },
  { id: 'duck', model: 'duck', at: [-0.3, -0.17], rot: [0, 0.5, 0] },
  { id: 'apple', model: 'apple', at: [-0.13, -0.19] },
  { id: 'king', model: 'king', at: [0.02, -0.18] },
  { id: 'rook', model: 'rook', at: [0.085, -0.16] },
  { id: 'knight', model: 'knight', at: [0.14, -0.2], rot: [0, 0.8, 0] },
  { id: 'baseball', model: 'baseball', at: [0.29, -0.16] },
  { id: 'lightbulb', model: 'lightbulb', at: [0.42, -0.12], rot: [0, 0.4, HALF_PI] },
  { id: 'cake', model: 'cake', at: [0.63, -0.02] },
  // front
  { id: 'binder', model: 'binder', at: [-0.64, 0.17], rot: [0, 0.2, 0] },
  { id: 'stapler', model: 'stapler', at: [-0.5, 0.04], rot: [0, 0.5, 0] },
  { id: 'pencilcup', model: 'pencilcup', at: [-0.33, 0.0] },
  { id: 'pen_a', model: 'pen_a', at: [-0.3, 0.14], rot: [0, 0.3, 0] },
  { id: 'pen_b', model: 'pen_b', at: [-0.32, 0.18], rot: [0, 0.15, 0] },
  { id: 'magnifier', model: 'magnifier', at: [0.04, 0.17], rot: [-HALF_PI, 0, 0.9] },
  { id: 'lemon', model: 'lemon', at: [0.27, 0.22], rot: [HALF_PI, 0, 0.3] },
  { id: 'spectacles', model: 'spectacles', at: [0.42, 0.08], rot: [0, -0.3, 0] },
  { id: 'croissant', model: 'croissant', at: [0.54, 0.19], rot: [0, 0.4, 0] },
  { id: 'cassette', model: 'cassette', at: [0.78, 0.16], rot: [-HALF_PI, 0, 0.3] },
]
for (const m of new Set(ITEMS.map((i) => i.model))) useGLTF.preload(`/models/items/${m}.glb`)

/* ------------------------------------------------------------------ dragging */
interface Grab {
  body: RapierRigidBody
  plane: THREE.Plane
  offset: THREE.Vector3 // body centre minus the grabbed point
  minY: number
}
const grab: { current: Grab | null } = { current: null }
/** the room the items must stay inside while held (matches Room.tsx) */
const BOUNDS = { minX: -1.5, maxX: 2.6, minZ: -0.6, maxZ: 1.3, maxY: 1.3 }
const MAX_HOLD_SPEED = 3.5
const MAX_THROW_SPEED = 3

/**
 * Moves the held body toward the pointer by setting its velocity, so it still collides with everything.
 * The velocity is set before every physics step (not once per rendered frame), so the hold is stable at any
 * frame rate: the body eases onto the target instead of coasting past it during a long frame.
 */
export function DragController() {
  const camera = useThree((s) => s.camera)
  const pointer = useThree((s) => s.pointer)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const vel = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const release = () => {
      const g = grab.current
      if (!g) return
      grab.current = null
      document.body.style.cursor = ''
      // let go: keep the motion (a throw), but never faster than the room can contain
      const v = g.body.linvel()
      vel.set(v.x, v.y, v.z).clampLength(0, MAX_THROW_SPEED)
      g.body.setLinvel(vel, true)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
  }, [vel])

  const goal = useMemo(() => new THREE.Vector3(), [])
  const hasGoal = useRef(false)
  useFrame(() => {
    const g = grab.current
    hasGoal.current = false
    if (!g) return
    raycaster.setFromCamera(pointer, camera)
    if (!raycaster.ray.intersectPlane(g.plane, hit)) return
    hit.add(g.offset)
    goal.set(
      THREE.MathUtils.clamp(hit.x, BOUNDS.minX, BOUNDS.maxX),
      THREE.MathUtils.clamp(hit.y, g.minY, BOUNDS.maxY),
      THREE.MathUtils.clamp(hit.z, BOUNDS.minZ, BOUNDS.maxZ),
    )
    hasGoal.current = true
  })
  useBeforePhysicsStep(() => {
    const g = grab.current
    if (!g || !hasGoal.current) return
    const p = g.body.translation()
    vel.set(goal.x - p.x, goal.y - p.y, goal.z - p.z).multiplyScalar(14).clampLength(0, MAX_HOLD_SPEED)
    g.body.setLinvel(vel, true)
    const a = g.body.angvel()
    g.body.setAngvel({ x: a.x * 0.9, y: a.y * 0.9, z: a.z * 0.9 }, true)
  })
  return null
}

/* ------------------------------------------------------------------ one item */
const GRAVITY = -9.81
const registry = new Map<string, RapierRigidBody>()
const debugUniforms = new Map<string, unknown>()

function Item({ def }: { def: ItemDef }) {
  const { scene } = useGLTF(`/models/items/${def.model}.glb`)
  const geometry = useMemo(() => {
    let g: THREE.BufferGeometry | null = null
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry })
    const geo = g as unknown as THREE.BufferGeometry
    geo.computeBoundingBox()
    return geo
  }, [scene])
  const half = useMemo(() => geometry.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.5), [geometry])
  const body = useRef<RapierRigidBody>(null)
  const camera = useThree((s) => s.camera)
  const touch = useUI((s) => s.touch)

  const uniforms = useMemo(
    () => ({ uSquash: { value: new THREE.Vector4(0, 1, 0, 0) }, uLag: { value: new THREE.Vector3() }, uHalf: { value: half } }),
    [half],
  )
  const material = useMemo(() => {
    const m = makeJellyMaterial({ thickness: THREE.MathUtils.clamp(Math.min(half.x, half.y, half.z) * 1.6, 0.006, 0.03) })
    patchJellyShader(m, 'item', uniforms)
    return m
  }, [uniforms, half])
  const depthMaterial = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchJellyShader(m, 'item', uniforms)
    return m
  }, [uniforms])

  // resting pose: upright bounding box height after the initial rotation
  const spawn = useMemo(() => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def.rot ?? [0, 0, 0])))
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert())
    const h = Math.abs(up.x) * half.x + Math.abs(up.y) * half.y + Math.abs(up.z) * half.z
    return { position: [def.at[0], h + 0.004 + (def.lift ?? 0), def.at[1]] as [number, number, number], h }
  }, [def, half])

  useEffect(() => {
    const b = body.current
    if (b) registry.set(def.id, b)
    debugUniforms.set(def.id, uniforms)
    return () => { registry.delete(def.id); debugUniforms.delete(def.id) }
  }, [def.id, uniforms])

  // squash + lag springs, driven by the body's measured velocity changes
  const st = useRef({ prev: new THREE.Vector3(), has: false, s: 0, sv: 0, lag: new THREE.Vector3(), lagV: new THREE.Vector3(), awake: false, floorTime: 0 })
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), dv: new THREE.Vector3(), q: new THREE.Quaternion(), a: new THREE.Vector3() }), [])
  const minHalf = Math.min(half.x, half.y, half.z)

  useFrame((_, frameDt) => {
    const b = body.current
    if (!b) return
    const dt = Math.min(frameDt, 1 / 30)
    const S = st.current
    const lv = b.linvel()
    tmp.v.set(lv.x, lv.y, lv.z)
    if (!S.has) { S.prev.copy(tmp.v); S.has = true }
    tmp.dv.subVectors(tmp.v, S.prev)
    S.prev.copy(tmp.v)
    if (!b.isSleeping()) tmp.dv.y -= GRAVITY * dt // free fall is not an impact
    const held = grab.current?.body === b
    const mag = tmp.dv.length()
    if (mag > 0.1) {
      const r = b.rotation()
      tmp.q.set(r.x, r.y, r.z, r.w).invert()
      tmp.a.copy(tmp.dv).applyQuaternion(tmp.q) // local-space velocity change
      if (!held && mag > 0.22) {
        // an impact: the velocity change points away from whatever was hit
        if (Math.abs(S.s) < 0.06 || mag > 0.8) uniforms.uSquash.value.set(tmp.a.x / mag, tmp.a.y / mag, tmp.a.z / mag, S.s)
        S.sv += Math.min(mag * 4.2, 13)
      }
      S.lagV.addScaledVector(tmp.a, -(held ? 0.035 : 0.06))
      S.awake = true
    }
    // anything that ends up on the floor (or somehow outside the room) drops back onto its spot on the desk
    const p = b.translation()
    const lost = p.y < -0.2 || Math.abs(p.x) > 4 || Math.abs(p.z) > 4
    S.floorTime = lost && !held ? S.floorTime + dt : 0
    if (S.floorTime > 2.5 || p.y < -1.5) {
      S.floorTime = 0
      b.setTranslation({ x: spawn.position[0], y: spawn.position[1] + 0.18, z: spawn.position[2] }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      b.setAngvel({ x: 0, y: 0, z: 0 }, true)
      S.has = false
    }
    if (!S.awake) return
    // integrate the springs
    const steps = Math.max(1, Math.round(dt / (1 / 240)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      S.sv += (-820 * S.s - 2 * 0.16 * Math.sqrt(820) * S.sv) * h
      S.s += S.sv * h
      if (S.s > 0.42) { S.s = 0.42; if (S.sv > 0) S.sv *= -0.3 }
      if (S.s < -0.22) { S.s = -0.22; if (S.sv < 0) S.sv *= -0.3 }
      S.lagV.addScaledVector(S.lag, -620 * h).multiplyScalar(1 - 2 * 0.13 * Math.sqrt(620) * h)
      S.lag.addScaledVector(S.lagV, h)
    }
    S.lag.clampLength(0, Math.max(minHalf * 0.5, 0.004))
    uniforms.uSquash.value.w = S.s
    uniforms.uLag.value.copy(S.lag)
    if (Math.abs(S.s) + Math.abs(S.sv) * 0.02 + S.lag.length() * 50 + S.lagV.length() < 0.004) {
      S.awake = false
      S.s = 0; S.sv = 0; S.lag.set(0, 0, 0); S.lagV.set(0, 0, 0)
      uniforms.uSquash.value.w = 0
      uniforms.uLag.value.set(0, 0, 0)
    }
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const b = body.current
    if (!b) return
    e.stopPropagation()
    const p = b.translation()
    const normal = camera.getWorldDirection(new THREE.Vector3()).negate()
    grab.current = {
      body: b,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, e.point),
      offset: new THREE.Vector3(p.x - e.point.x, p.y - e.point.y, p.z - e.point.z),
      // held things hover just clear of the desk, so picking up reads as lifting
      minY: Math.max(half.x, half.y, half.z) * 0.6 + 0.03,
    }
    b.wakeUp()
    document.body.style.cursor = 'grabbing'
    touch('hero')
  }

  return (
    <RigidBody
      ref={body}
      colliders="hull"
      position={spawn.position}
      rotation={def.rot}
      restitution={0.5}
      friction={0.9}
      linearDamping={0.2}
      angularDamping={0.9}
      ccd
    >
      <mesh
        geometry={geometry}
        material={material}
        customDepthMaterial={depthMaterial}
        castShadow
        ref={castsDeskShadow}
        onPointerDown={onPointerDown}
        onPointerOver={() => { if (!grab.current) document.body.style.cursor = 'grab' }}
        onPointerOut={() => { if (!grab.current) document.body.style.cursor = '' }}
      />
    </RigidBody>
  )
}

export function Items() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __jelly?: Record<string, unknown> }
    w.__jelly = { ...(w.__jelly ?? {}), items: registry, itemUniforms: debugUniforms }
  }, [])
  return (
    <>
      <DragController />
      {ITEMS.map((d) => (
        <Item key={d.id} def={d} />
      ))}
    </>
  )
}
