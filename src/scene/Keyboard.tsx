import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { KeyboardSim } from '../jelly/keyboardSim'
import { layoutAtlas, paintLegendAtlas } from '../jelly/legends'
import { makeBodyJellyMaterial, makeJellyMaterial, patchJellyShader, PALETTE } from '../jelly/jellyMaterial'
import type { KeyInfo } from '../jelly/layout'
import { useUI } from '../store'
import { castsDeskShadow } from './DeskShadows'

const MODEL = '/models/keyboard.glb'
useGLTF.preload(MODEL)

interface Built {
  geometry: THREE.BufferGeometry
  keys: KeyInfo[]
  byCode: Map<string, number>
  caseGeoms: THREE.BufferGeometry[]
  plateY: number
  bodyTop: number
}

/** Merges the 84 keycap meshes into one draw call with per-vertex key id / centre / size / legend UVs. */
function buildKeyboard(scene: THREE.Group): Built {
  const keys: KeyInfo[] = []
  const geoms: THREE.BufferGeometry[] = []
  const caseGeoms: THREE.BufferGeometry[] = []
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    const mesh = o as THREE.Mesh
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    if (mesh.name.startsWith('key_')) {
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const size = new THREE.Vector3().subVectors(bb.max, bb.min)
      const info: KeyInfo = {
        code: mesh.name.slice(4),
        index: keys.length,
        center: [(bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2],
        size: [size.x, size.y, size.z],
        min: bb.min.toArray() as [number, number, number],
        max: bb.max.toArray() as [number, number, number],
      }
      keys.push(info)
      geoms.push(g)
    } else {
      caseGeoms.push(g)
    }
  })
  const atlas = layoutAtlas(keys)
  keys.forEach((k, i) => {
    const g = geoms[i]
    const count = g.attributes.position.count
    const aKey = new Float32Array(count).fill(k.index)
    const aCenter = new Float32Array(count * 3)
    const aSize = new Float32Array(count * 3)
    const uv = new Float32Array(count * 2)
    const c = atlas.cells[k.index]
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < count; v++) {
      aCenter.set(k.center, v * 3)
      aSize.set(k.size, v * 3)
      const fx = (pos.getX(v) - k.min[0]) / k.size[0]
      const fz = (pos.getZ(v) - k.min[2]) / k.size[2]
      uv[v * 2] = (c.x + fx * c.w) / atlas.width
      uv[v * 2 + 1] = 1 - (c.y + fz * c.h) / atlas.height
    }
    g.setAttribute('aKey', new THREE.BufferAttribute(aKey, 1))
    g.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(aSize, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  })
  const geometry = mergeGeometries(geoms, false)!
  geometry.computeBoundingSphere()
  let plateY = 0
  for (const g of caseGeoms) { g.computeBoundingBox(); plateY = Math.max(plateY, g.boundingBox!.max.y) }
  const bodyTop = Math.max(...keys.map((k) => k.max[1]))
  return { geometry, keys, byCode: new Map(keys.map((k) => [k.code, k.index])), caseGeoms, plateY, bodyTop }
}

export function Keyboard(props: { position?: [number, number, number]; rotation?: [number, number, number] }) {
  const { scene } = useGLTF(MODEL)
  const built = useMemo(() => buildKeyboard(scene), [scene])
  const sim = useMemo(() => new KeyboardSim(built.keys), [built])
  const meshRef = useRef<THREE.Mesh>(null)
  const touch = useUI((s) => s.touch)

  const uniforms = useMemo(
    () => ({
      uKeyState: { value: sim.texture },
      uBodyField: { value: sim.fieldTexture },
      uFieldRect: { value: sim.fieldRect },
      uBody: { value: new THREE.Vector4() },
      uRock: { value: new THREE.Vector2() },
      uBodyTop: { value: built.bodyTop },
      uPlateY: { value: built.plateY },
      uTravel: { value: 0.0028 },
      uSquash: { value: 0.3 },
      uDimple: { value: 0.0019 },
    }),
    [sim, built],
  )

  const material = useMemo(() => {
    const m = makeJellyMaterial({ thickness: 0.014, color: PALETTE.jelly.clone() })
    // FrontSide on purpose: three.js draws the back faces of double-sided transmissive meshes into the
    // transmission buffer, and the jelly desk then refracts a smeared row of keycap silhouettes.
    patchJellyShader(m, 'keycap', uniforms)
    return m
  }, [uniforms])

  const depthMaterial = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchJellyShader(m, 'keycap', uniforms)
    return m
  }, [uniforms])

  // legends: painted asynchronously once the font is in; until then the jelly is plain
  useEffect(() => {
    let alive = true
    paintLegendAtlas(built.keys, layoutAtlas(built.keys)).then(({ map, transmissionMap }) => {
      if (!alive) { map.dispose(); transmissionMap.dispose(); return }
      material.map = map
      material.transmissionMap = transmissionMap
      material.color.set('#ffffff')
      material.needsUpdate = true
    })
    return () => { alive = false }
  }, [built, material])

  const groupRef = useRef<THREE.Group>(null)
  const resetId = useUI((s) => s.resetId)
  useEffect(() => { groupRef.current?.traverse(castsDeskShadow) }, [built])
  useFrame((_, dt) => {
    sim.update(dt)
    uniforms.uBody.value.set(sim.bounce.x, sim.swayX.x, sim.swayZ.x, 0)
    uniforms.uRock.value.set(sim.rockX.x, sim.rockZ.x)
  })


  // dev-only hook so the deformation can be driven from the console / automated screenshots
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __jelly?: Record<string, unknown> }
    ;(window as unknown as { __jellyTyped?: () => string }).__jellyTyped = () => useUI.getState().typed
    w.__jelly = { ...(w.__jelly ?? {}), keyboard: sim, keyUniforms: uniforms, keyIndex: (code: string) => built.byCode.get(code), focus: (f: 'hero' | 'keyboard' | 'mouse') => useUI.getState().touch(f) }
  }, [sim, built, uniforms])

  /* ---------------------------------------------------------------- pointer interaction */
  const pointers = useRef(new Map<number, number>()) // pointerId -> key index
  const tmp = useMemo(() => new THREE.Vector3(), [])

  const keyAt = (e: ThreeEvent<PointerEvent>) => {
    const idx = (e.faceIndex ?? -1) * 3
    const index = meshRef.current!.geometry.index!
    if (idx < 0) return -1
    return (meshRef.current!.geometry.attributes.aKey as THREE.BufferAttribute).getX(index.getX(idx))
  }
  const localTouch = (e: ThreeEvent<PointerEvent>, k: KeyInfo) => {
    meshRef.current!.worldToLocal(tmp.copy(e.point))
    return [
      THREE.MathUtils.clamp((tmp.x - k.center[0]) / k.size[0], -0.5, 0.5),
      THREE.MathUtils.clamp((tmp.z - k.center[2]) / k.size[2], -0.5, 0.5),
    ] as const
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    const i = keyAt(e)
    if (i < 0) return
    const [tx, tz] = localTouch(e, built.keys[i])
    pointers.current.set(e.pointerId, i)
    sim.pressKey(i, tx, tz)
    useUI.getState().typeKey(built.keys[i].code)
    touch('keyboard')
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const held = pointers.current.get(e.pointerId)
    if (held === undefined) return
    const i = keyAt(e)
    if (i < 0) return
    const [tx, tz] = localTouch(e, built.keys[i])
    if (i !== held) {
      sim.releaseKey(held)
      pointers.current.set(e.pointerId, i)
      useUI.getState().typeKey(built.keys[i].code)
    }
    sim.pressKey(i, tx, tz)
  }
  const releasePointer = (id: number) => {
    const i = pointers.current.get(id)
    if (i === undefined) return
    pointers.current.delete(id)
    // if a physical key is holding it, keep it down
    if (!heldCodes.current.has(built.keys[i].code)) sim.releaseKey(i)
  }
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => releasePointer(e.pointerId)
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    // dragging off the cap onto the case releases it; the next cap entered gets pressed on move
    const i = pointers.current.get(e.pointerId)
    if (i !== undefined && !heldCodes.current.has(built.keys[i].code)) {
      sim.releaseKey(i)
    }
  }

  /* ---------------------------------------------------------------- physical keyboard */
  const heldCodes = useRef(new Set<string>())
  useEffect(() => { if (resetId) { pointers.current.clear(); heldCodes.current.clear(); sim.releaseAll() } }, [resetId, sim])
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const code = e.code === 'ContextMenu' ? 'Fn' : e.code
      const i = built.byCode.get(code)
      if (i === undefined) return
      if (!e.metaKey && !e.ctrlKey) e.preventDefault()
      if (e.repeat) return
      heldCodes.current.add(code)
      // fingers land a little off-centre, differently every time
      sim.pressKey(i, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.3)
      if (!e.metaKey && !e.ctrlKey) useUI.getState().typeKey(code, e.key)
      touch('keyboard')
    }
    const up = (e: KeyboardEvent) => {
      const code = e.code === 'ContextMenu' ? 'Fn' : e.code
      const i = built.byCode.get(code)
      if (i === undefined) return
      heldCodes.current.delete(code)
      if (![...pointers.current.values()].includes(i)) sim.releaseKey(i)
    }
    const cancel = () => {
      heldCodes.current.clear()
      pointers.current.clear()
      sim.releaseAll()
    }
    const pointerEnd = (e: PointerEvent) => releasePointer(e.pointerId)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', cancel)
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
    }
  }, [built, sim, touch]) // eslint-disable-line react-hooks/exhaustive-deps

  // the case is the same gelatin as the caps, cast as one thick slab, and it sags and wobbles with them
  const caseMaterial = useMemo(() => {
    const m = makeBodyJellyMaterial({ thickness: 0.02, depth: 0.07 })
    patchJellyShader(m, 'case', uniforms)
    return m
  }, [uniforms])
  const caseDepth = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patchJellyShader(m, 'case', uniforms)
    return m
  }, [uniforms])

  return (
    <group ref={groupRef} position={props.position} rotation={props.rotation}>
      <mesh
        ref={meshRef}
        geometry={built.geometry}
        material={material}
        customDepthMaterial={depthMaterial}
        castShadow
        receiveShadow
        userData={{ jellyInteractive: true }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOut={onPointerOut}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerLeave={() => (document.body.style.cursor = '')}
      />
      {built.caseGeoms.map((g, i) => (
        <mesh key={i} geometry={g} material={caseMaterial} customDepthMaterial={caseDepth} castShadow receiveShadow />
      ))}
    </group>
  )
}
