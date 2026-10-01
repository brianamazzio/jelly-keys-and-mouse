import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerspectiveCamera } from '@react-three/drei'
import { DeskShadows } from './DeskShadows'
import { EffectComposer, N8AO, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Keyboard } from './Keyboard'
import { Mouse } from './Mouse'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { Items } from './Items'
import { DESK, Room } from './Room'
import { PALETTE } from '../jelly/jellyMaterial'
import { useUI, type Focus } from '../store'

const KEYBOARD_POS: [number, number, number] = [-0.03, 0, 0]
const KEYBOARD_ROT: [number, number, number] = [0, -0.06, 0]
const MOUSE_POS: [number, number, number] = [0.222, 0, 0.012]
const MOUSE_ROT: [number, number, number] = [0, -0.22, 0]

interface Shot { pos: THREE.Vector3; target: THREE.Vector3 }
const SHOTS: Record<Focus, Shot> = {
  // the whole desk and the wall behind it
  hero: { pos: new THREE.Vector3(-0.52, 0.62, 1.2), target: new THREE.Vector3(0.1, 0.1, -0.16) },
  keyboard: { pos: new THREE.Vector3(-0.15, 0.135, 0.205), target: new THREE.Vector3(-0.055, 0.0, 0.005) },
  mouse: { pos: new THREE.Vector3(0.075, 0.13, -0.15), target: new THREE.Vector3(0.222, 0.016, -0.002) },
}
const IDLE_MS = 9000
const DESK_SHADOW_SIZE: [number, number] = [DESK.w, DESK.d]
const DESK_SHADOW_POS: [number, number, number] = [DESK.x, 0.0006, DESK.z]

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const pointer = useThree((s) => s.pointer)
  const scene = useThree((s) => s.scene)
  const pos = useRef(SHOTS.hero.pos.clone())
  const target = useRef(SHOTS.hero.target.clone())
  const tmpPos = useMemo(() => new THREE.Vector3(), [])
  const tmpTarget = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const { focus, lastInteraction, setFocus } = useUI.getState()
    if (focus !== 'hero' && performance.now() - lastInteraction > IDLE_MS) setFocus('hero')
    let shot = SHOTS[focus]
    let snap = false
    if (import.meta.env.DEV) {
      const o = (window as unknown as { __jellyCam?: Shot }).__jellyCam
      if (o) { shot = o; snap = true }
    }
    const portrait = size.width / size.height < 0.9
    tmpPos.copy(shot.pos)
    tmpTarget.copy(shot.target)
    // squarer windows pull back so the mouse stays in frame
    const back = THREE.MathUtils.clamp(1.6 / (size.width / size.height), 1, 1.45)
    if (!portrait && back > 1 && !snap) tmpPos.sub(tmpTarget).multiplyScalar(back).add(tmpTarget)
    if (portrait) {
      // narrow viewports: pull back and climb so the desk still fits
      tmpPos.sub(tmpTarget).multiplyScalar(focus === 'hero' ? 1.45 : 1.7).add(tmpTarget)
      tmpPos.y += focus === 'hero' ? 0.2 : 0.12
    }
    const t = snap ? 1 : Math.min(1, dt * 1.6)
    pos.current.lerp(tmpPos, t)
    target.current.lerp(tmpTarget, t)
    // slow breathing drift + a whisper of pointer parallax keeps the still alive
    const now = performance.now() / 1000
    const drift = focus === 'hero' ? 1 : 0.4
    camera.position.set(
      pos.current.x + Math.sin(now * 0.37) * 0.004 * drift + pointer.x * 0.006,
      pos.current.y + Math.sin(now * 0.29 + 1.3) * 0.0025 * drift + pointer.y * 0.003,
      pos.current.z + Math.cos(now * 0.31) * 0.003 * drift,
    )
    camera.lookAt(target.current)
    // keep the horizon haze behind the products however far the camera has pulled back
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      const d = pos.current.distanceTo(target.current)
      fog.near = Math.max(0.55, d * 1.3)
      fog.far = Math.max(1.5, d * 3.5)
    }
    const fov = portrait ? 38 : focus === 'hero' ? 34 : 28
    camera.fov += (fov - camera.fov) * (snap ? 1 : Math.min(1, dt * 2.5))
    camera.updateProjectionMatrix()
  })
  return null
}

function Studio() {
  return (
    <>
      <Environment resolution={1024} frames={1} background={false}>
        {/* large soft key, high front-left */}
        <Lightformer form="rect" intensity={5.5} color="#fff6ea" position={[-1.6, 2.4, 1.4]} scale={[3.2, 2.2, 1]} target={[0, 0, 0]} />
        {/* controlled fill from the right */}
        <Lightformer form="rect" intensity={0.8} color="#e8eef8" position={[2.4, 1.3, 1.6]} scale={[2.2, 1.6, 1]} target={[0, 0, 0]} />
        {/* thin rim strip behind to reveal translucency */}
        <Lightformer form="rect" intensity={3.5} color="#ffe9dc" position={[0.6, 1.1, -2.6]} scale={[4, 0.35, 1]} target={[0, 0, 0]} />
        {/* faint sky dome for gentle ambience */}
        <Lightformer form="ring" intensity={0.2} color="#f2ece4" position={[0, 4, 0]} scale={[10, 10, 1]} target={[0, 0, 0]} />
        {/* negative fill: a dark card low-left so the sides of the jelly keep definition */}
        <Lightformer form="rect" intensity={0} color="#000" position={[-2.5, 0.3, -0.5]} scale={[3, 1.5, 1]} target={[0, 0, 0]} />
      </Environment>
      <directionalLight
        position={[-0.85, 1.45, 0.95]}
        intensity={3.0}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.004}
        shadow-radius={4}
        shadow-intensity={0.62}
        shadow-camera-near={0.2}
        shadow-camera-far={4.5}
        shadow-camera-left={-1.7}
        shadow-camera-right={1.7}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-1.6}
      />
      <directionalLight position={[0.8, 0.5, -0.7]} intensity={0.55} color="#e6ecf7" />
    </>
  )
}

function Ready() {
  const setReady = useUI((s) => s.setReady)
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current++ === 8) setReady()
  })
  return null
}

function Post() {
  const size = useThree((s) => s.size)
  const small = size.width < 800
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.014} distanceFalloff={0.03} intensity={2.6} quality={small ? 'medium' : 'high'} halfRes={small} color="#3a0d18" />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette eskil={false} offset={0.28} darkness={small ? 0.25 : 0.42} />
      <SMAA />
    </EffectComposer>
  )
}

const DEBUG = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams()

export function Scene() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __jelly?: Record<string, unknown> }
    w.__jelly = { ...(w.__jelly ?? {}), scene }
  }, [scene])
  useEffect(() => {
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.shadowMap.enabled = !DEBUG.has('noshadow')
    gl.toneMapping = THREE.NoToneMapping
    gl.transmissionResolutionScale = 1
  }, [gl])
  return (
    <>
      <color attach="background" args={['#8f1533']} />
      <PerspectiveCamera makeDefault fov={28} near={0.02} far={12} position={SHOTS.hero.pos.toArray()} />
      <CameraRig />
      <Studio />
      {/* soft, blurred grounding shadows on the desk top, re-rendered every frame so they follow moving items */}
      <DeskShadows position={DESK_SHADOW_POS} size={DESK_SHADOW_SIZE} far={0.2} blur={0.0075} opacity={0.9} color={PALETTE.shadow} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 120} debug={DEBUG.has('physics')}>
          <Room />
          <Items />
          {/* the keyboard and mouse stay put; boxes stand in for them so thrown things bounce off */}
          <RigidBody type="fixed" colliders={false} restitution={0.6} friction={0.8}>
            <CuboidCollider position={[KEYBOARD_POS[0], 0.0115, KEYBOARD_POS[2]]} rotation={KEYBOARD_ROT} args={[0.1544, 0.0115, 0.0598]} />
            <CuboidCollider position={[MOUSE_POS[0], 0.016, MOUSE_POS[2]]} rotation={MOUSE_ROT} args={[0.03, 0.016, 0.055]} />
          </RigidBody>
        </Physics>
        <Keyboard position={KEYBOARD_POS} rotation={KEYBOARD_ROT} />
        <Mouse position={MOUSE_POS} rotation={MOUSE_ROT} />
        <Ready />
      </Suspense>
      {!DEBUG.has('nopost') && <Post />}
    </>
  )
}
