import { create } from 'zustand'

/** Which product the camera should favour. Driven by interaction, returns to `hero` after idling. */
export type Focus = 'hero' | 'keyboard' | 'mouse'

interface UIState {
  focus: Focus
  lastInteraction: number
  ready: boolean
  setFocus: (f: Focus) => void
  touch: (f: Focus) => void
  setReady: () => void
}

export const useUI = create<UIState>((set) => ({
  focus: 'hero',
  lastInteraction: performance.now(),
  ready: false,
  setFocus: (focus) => set({ focus }),
  touch: (focus) => set({ focus, lastInteraction: performance.now() }),
  setReady: () => set({ ready: true }),
}))
