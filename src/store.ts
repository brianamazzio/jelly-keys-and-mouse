import { create } from 'zustand'
import { charForCode } from './jelly/typing'

/** Which product the camera should favour. Driven by interaction, returns to `hero` after idling. */
export type Focus = 'hero' | 'keyboard' | 'mouse'
/** 'auto': the camera frames whatever you use. 'free': you moved it yourself, so it stays put until Reset. */
export type CamMode = 'auto' | 'free'

interface UIState {
  focus: Focus
  camMode: CamMode
  lastInteraction: number
  ready: boolean
  /** bumps on every Reset; components that hold state watch it */
  resetId: number
  /** what has been typed on the jelly keyboard; shown on the monitor */
  typed: string
  typeKey: (code: string, key?: string) => void
  setFocus: (f: Focus) => void
  touch: (f: Focus) => void
  setCamMode: (m: CamMode) => void
  setReady: () => void
  reset: () => void
}

export const useUI = create<UIState>((set) => ({
  focus: 'hero',
  camMode: 'auto',
  lastInteraction: performance.now(),
  ready: false,
  resetId: 0,
  typed: '',
  typeKey: (code, key) =>
    set((s) => {
      if (code === 'Backspace' || code === 'Delete') return { typed: s.typed.slice(0, -1) }
      let ch: string | null = null
      if (key !== undefined) ch = key === 'Enter' ? '\n' : key === 'Tab' ? '  ' : key.length === 1 ? key : null
      else ch = charForCode(code)
      if (ch === null) return {}
      return { typed: (s.typed + ch).slice(-700) }
    }),
  setFocus: (focus) => set({ focus }),
  touch: (focus) => set({ focus, lastInteraction: performance.now() }),
  setCamMode: (camMode) => set({ camMode }),
  setReady: () => set({ ready: true }),
  reset: () => set((s) => ({ typed: '', resetId: s.resetId + 1, focus: 'hero', camMode: 'auto', lastInteraction: performance.now() })),
}))
