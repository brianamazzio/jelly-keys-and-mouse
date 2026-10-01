import * as THREE from 'three'
import { useUI } from '../store'

/**
 * What the jelly monitor shows: a minimal text editor that fills with whatever you type, on the real
 * keyboard or by pressing the jelly keys. Drawn into a canvas (screen aspect, 0.574 x 0.366 m) and mapped
 * onto the panel's front faces by the screen shader. Flat colours only; Inter Tight like the keycaps.
 */
const W = 1600
const H = Math.round((W * 0.366) / 0.574)
const FONT = '"Inter Tight", system-ui, sans-serif'
const C = {
  desk: '#b80d27', // the "wallpaper": the screen's own red
  window: '#ffc6ce',
  title: '#ffa3b1',
  ink: '#7a0a1d',
  dim: '#d8828f',
  caret: '#e0123a',
}

export function createScreen() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter

  let caretOn = true
  const draw = () => {
    const text = useUI.getState().typed
    ctx.fillStyle = C.desk
    ctx.fillRect(0, 0, W, H)
    // window
    const x = W * 0.09, y = H * 0.1, w = W * 0.82, h = H * 0.8, r = 22, bar = 64
    ctx.fillStyle = C.window
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
    ctx.fillStyle = C.title
    ctx.beginPath(); ctx.roundRect(x, y, w, bar, [r, r, 0, 0]); ctx.fill()
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = C.caret
      ctx.globalAlpha = 0.55
      ctx.beginPath(); ctx.arc(x + 38 + i * 30, y + bar / 2, 9, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = C.ink
    ctx.font = `600 26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('jelly.txt', x + w / 2, y + bar / 2 + 1)
    // text, wrapped, newest lines kept
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const size = 58, lh = 76, pad = 60
    ctx.font = `500 ${size}px ${FONT}`
    const maxW = w - pad * 2
    const lines: string[] = []
    for (const para of text.split('\n')) {
      let line = ''
      for (const word of para.split(/(\s+)/)) {
        if (ctx.measureText(line + word).width > maxW && line) { lines.push(line); line = word.trimStart() }
        else line += word
        while (ctx.measureText(line).width > maxW) {
          let cut = line.length
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--
          lines.push(line.slice(0, cut)); line = line.slice(cut)
        }
      }
      lines.push(line)
    }
    const maxLines = Math.floor((h - bar - pad * 1.4) / lh)
    const shown = lines.slice(-maxLines)
    const top = y + bar + pad + size * 0.4
    if (!text) {
      ctx.fillStyle = C.dim
      ctx.fillText('type on the jelly keyboard…', x + pad, top + size * 0.4)
    }
    ctx.fillStyle = C.ink
    shown.forEach((l, i) => ctx.fillText(l, x + pad, top + i * lh + size * 0.4))
    if (caretOn) {
      const last = shown[shown.length - 1] ?? ''
      const cx = x + pad + (text ? ctx.measureText(last).width : 0) + 4
      const cy = top + (shown.length - 1) * lh + size * 0.4
      ctx.fillStyle = C.caret
      ctx.fillRect(cx, cy - size * 0.8, 5, size * 0.98)
    }
    texture.needsUpdate = true
  }

  draw()
  let unsub = () => {}
  let blink = 0
  return {
    texture,
    /** start redrawing on typing and blinking the caret (call from an effect) */
    start() {
      document.fonts?.load(`500 58px ${FONT}`).then(draw, draw)
      unsub = useUI.subscribe((s, prev) => { if (s.typed !== prev.typed) { caretOn = true; draw() } })
      blink = window.setInterval(() => { caretOn = !caretOn; draw() }, 530)
    },
    stop() { unsub(); window.clearInterval(blink) },
  }
}

