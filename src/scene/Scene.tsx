import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
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

/** Where the camera may go when you move it yourself: inside the room, and a little out of its open front. */
const CAM_BOUNDS = new THREE.Box3(new THREE.Vector3(-1.5, -0.7, -0.55), new THREE.Vector3(2.66, 1.45, 2.2))
const TARGET_BOUNDS = new THREE.Box3(new THREE.Vector3(-1.5, -0.78, -0.6), new THREE.Vector3(2.7, 1.4, 1.4))

/**
 * Camera. In 'auto' mode it flies to whatever you are using (keyboard, mouse) and back to the whole-desk
 * view after idling. Dragging empty space orbits, scrolling zooms, right-drag (or two fingers) pans: that
 * switches to 'free' mode, where nothing moves the camera but you, until Reset.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useRef<OrbitControlsImpl>(null)
  const tmpPos = useMemo(() => new THREE.Vector3(), [])
  const tmpTarget = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const { focus, camMode, lastInteraction, setFocus } = useUI.getState()
    const portrait = size.width / size.height < 0.9
    let snap = false
    if (camMode === 'auto') {
      if (focus !== 'hero' && performance.now() - lastInteraction > IDLE_MS) setFocus('hero')
      let shot = SHOTS[focus]
      if (import.meta.env.DEV) {
        const o = (window as unknown as { __jellyCam?: Shot }).__jellyCam
        if (o) { shot = o; snap = true }
      }
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
      camera.position.lerp(tmpPos, t)
      c.target.lerp(tmpTarget, t)
      c.update()
    } else {
      // free: stay inside the room
      c.target.clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max)
      camera.position.clamp(CAM_BOUNDS.min, CAM_BOUNDS.max)
    }
    const fov = portrait ? 38 : camMode === 'free' || focus === 'hero' ? 34 : 28
    camera.fov += (fov - camera.fov) * (snap ? 1 : Math.min(1, dt * 2.5))
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        target={SHOTS.hero.target}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        panSpeed={0.8}
        screenSpacePanning
        minDistance={0.06}
        maxDistance={2.4}
        maxPolarAngle={Math.PI * 0.62}
        onStart={() => useUI.getState().setCamMode('free')}
      />
      <PointerRouter controls={controls} />
    </>
  )
}

/**
 * Decides, before the orbit controls see an event, whether it is meant for an object or for the camera.
 * A press on anything interactive (a loose object, the keyboard, the mouse) switches the controls off
 * until release, so grabbing and typing never also orbit. A scroll over the jelly mouse spins its wheel
 * instead of zooming.
 */
function PointerRouter({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitFlag = (e: MouseEvent, flag: string) => {
      const r = gl.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.visible && (h.object as THREE.Mesh).isMesh)
      return !!hit && hit.object.userData[flag] === true
    }
    const down = (e: PointerEvent) => {
      const c = controls.current
      if (!c || e.target !== gl.domElement) return
      if (hitFlag(e, 'jellyInteractive')) c.enabled = false
    }
    const up = () => {
      const c = controls.current
      if (c) c.enabled = true
    }
    const wheel = (e: WheelEvent) => {
      const c = controls.current
      if (!c || e.target !== gl.domElement) return
      if (hitFlag(e, 'jellyWheel')) {
        c.enableZoom = false
        setTimeout(() => { c.enableZoom = true }, 0)
      }
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('wheel', wheel, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('wheel', wheel, true)
    }
  }, [gl, camera, scene, controls])
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
      {/* Khronos PBR Neutral keeps saturated reds saturated; AgX washed them toward white */}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
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
    // overall brightness; the post-processing tone mapping reads this
    gl.toneMappingExposure = 1.15
    gl.transmissionResolutionScale = 1
  }, [gl])
  return (
    <>
      <color attach="background" args={['#bd0f2c']} />
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
