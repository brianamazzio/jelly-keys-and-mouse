import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { Scene } from './scene/Scene'
import { useUI } from './store'

export default function App() {
  const ready = useUI((s) => s.ready)
  const focus = useUI((s) => s.focus)
  const reset = useUI((s) => s.reset)
  // a whole room of translucent jelly is heavy: drop the render resolution if the frame rate sags, raise it again if there is headroom
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2)
  const [dpr, setDpr] = useState(Math.min(maxDpr, 1.5))
  return (
    <>
      <Canvas
        shadows
        dpr={dpr}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', stencil: false }}
        onContextMenu={(e) => { /* only the jelly mouse suppresses the context menu (handled on its mesh) */ void e }}
      >
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.85, d - 0.25))} onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))} flipflops={4} />
        <Scene />
      </Canvas>
      <div className="copy" aria-hidden>
        <h1>JELLY KEYS <span>/</span> JELLY MOUSE</h1>
        <p className="hint">
          <b>ORBIT</b>
          <b>GRAB</b>
          <b>THROW</b>
          <b className={focus === 'mouse' ? 'dim' : ''}>PRESS</b>
          <b className={focus === 'keyboard' ? 'dim' : ''}>CLICK</b>
          <b className={focus === 'keyboard' ? 'dim' : ''}>SCROLL</b>
        </p>
      </div>
      <button
        className="reset"
        type="button"
        onClick={(e) => { reset(); e.currentTarget.blur() }}
        aria-label="Reset the scene: put every object back and return the camera to the starting view"
      >
        RESET
      </button>
      <div className={`loader${ready ? ' done' : ''}`}><div /></div>
    </>
  )
}
