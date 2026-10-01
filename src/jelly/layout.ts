/** Legend definitions keyed by KeyboardEvent.code. `sub` is drawn small above the primary legend. */
export interface Legend {
  main: string
  sub?: string
  /** small word legend (modifiers), lower-left aligned */
  word?: boolean
  /** vector glyph instead of text */
  glyph?: 'up' | 'down' | 'left' | 'right' | 'backspace' | 'enter' | 'meta' | 'tab' | 'shift' | 'caps'
}

export const LEGENDS: Record<string, Legend> = {
  Escape: { main: 'esc', word: true },
  F1: { main: 'F1', word: true }, F2: { main: 'F2', word: true }, F3: { main: 'F3', word: true }, F4: { main: 'F4', word: true },
  F5: { main: 'F5', word: true }, F6: { main: 'F6', word: true }, F7: { main: 'F7', word: true }, F8: { main: 'F8', word: true },
  F9: { main: 'F9', word: true }, F10: { main: 'F10', word: true }, F11: { main: 'F11', word: true }, F12: { main: 'F12', word: true },
  PrintScreen: { main: 'prt sc', word: true }, Pause: { main: 'pause', word: true }, Delete: { main: 'del', word: true },
  Backquote: { main: '`', sub: '~' },
  Digit1: { main: '1', sub: '!' }, Digit2: { main: '2', sub: '@' }, Digit3: { main: '3', sub: '#' }, Digit4: { main: '4', sub: '$' },
  Digit5: { main: '5', sub: '%' }, Digit6: { main: '6', sub: '^' }, Digit7: { main: '7', sub: '&' }, Digit8: { main: '8', sub: '*' },
  Digit9: { main: '9', sub: '(' }, Digit0: { main: '0', sub: ')' }, Minus: { main: '-', sub: '_' }, Equal: { main: '=', sub: '+' },
  Backspace: { main: '', glyph: 'backspace' }, Home: { main: 'home', word: true },
  Tab: { main: 'tab', word: true },
  KeyQ: { main: 'Q' }, KeyW: { main: 'W' }, KeyE: { main: 'E' }, KeyR: { main: 'R' }, KeyT: { main: 'T' }, KeyY: { main: 'Y' },
  KeyU: { main: 'U' }, KeyI: { main: 'I' }, KeyO: { main: 'O' }, KeyP: { main: 'P' },
  BracketLeft: { main: '[', sub: '{' }, BracketRight: { main: ']', sub: '}' }, Backslash: { main: '\\', sub: '|' }, PageUp: { main: 'pg up', word: true },
  CapsLock: { main: 'caps', word: true },
  KeyA: { main: 'A' }, KeyS: { main: 'S' }, KeyD: { main: 'D' }, KeyF: { main: 'F' }, KeyG: { main: 'G' }, KeyH: { main: 'H' },
  KeyJ: { main: 'J' }, KeyK: { main: 'K' }, KeyL: { main: 'L' },
  Semicolon: { main: ';', sub: ':' }, Quote: { main: "'", sub: '"' }, Enter: { main: 'enter', word: true }, PageDown: { main: 'pg dn', word: true },
  ShiftLeft: { main: 'shift', word: true },
  KeyZ: { main: 'Z' }, KeyX: { main: 'X' }, KeyC: { main: 'C' }, KeyV: { main: 'V' }, KeyB: { main: 'B' }, KeyN: { main: 'N' }, KeyM: { main: 'M' },
  Comma: { main: ',', sub: '<' }, Period: { main: '.', sub: '>' }, Slash: { main: '/', sub: '?' }, ShiftRight: { main: 'shift', word: true },
  ArrowUp: { main: '', glyph: 'up' }, End: { main: 'end', word: true },
  ControlLeft: { main: 'ctrl', word: true }, MetaLeft: { main: '', glyph: 'meta' }, AltLeft: { main: 'alt', word: true }, Space: { main: '' },
  AltRight: { main: 'alt', word: true }, Fn: { main: 'fn', word: true }, ControlRight: { main: 'ctrl', word: true },
  ArrowLeft: { main: '', glyph: 'left' }, ArrowDown: { main: '', glyph: 'down' }, ArrowRight: { main: '', glyph: 'right' },
}

/** Physical key order inside the merged geometry and its texture atlas. */
export interface KeyInfo {
  code: string
  index: number
  center: [number, number, number] // bottom-centre in keyboard space
  size: [number, number, number]
  min: [number, number, number]
  max: [number, number, number]
}
