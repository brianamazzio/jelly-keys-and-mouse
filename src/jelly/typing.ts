/** Character produced by a jelly key pressed with the pointer (physical keys use KeyboardEvent.key). */
export function charForCode(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  if (code.startsWith('Digit')) return code.slice(5)
  const map: Record<string, string> = {
    Space: ' ', Enter: '\n', Tab: '  ', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
    Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
  }
  return map[code] ?? null
}
