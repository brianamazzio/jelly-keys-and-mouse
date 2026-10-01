import * as THREE from 'three'
import { LEGENDS, type KeyInfo } from './layout'
import { PALETTE } from './jellyMaterial'

const CELL = 256
const PITCH = 0.01905
const WIDTH = 4096

export interface AtlasCell { x: number; y: number; w: number; h: number }
export interface AtlasLayout { cells: AtlasCell[]; width: number; height: number }

/** Pure function of key sizes: packs one cell per key, row by row, so UVs can be built before fonts load. */
export function layoutAtlas(keys: KeyInfo[]): AtlasLayout {
  const rows = new Map<number, KeyInfo[]>()
  for (const k of keys) {
    const rz = Math.round(k.center[2] * 200) / 200
    if (!rows.has(rz)) rows.set(rz, [])
    rows.get(rz)!.push(k)
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b)
  const cells: AtlasCell[] = new Array(keys.length)
  rowKeys.forEach((rz, r) => {
    const row = rows.get(rz)!.sort((a, b) => a.center[0] - b.center[0])
    let x = 0
    for (const k of row) {
      const w = Math.round((k.size[0] / PITCH) * CELL)
      cells[k.index] = { x, y: r * CELL, w, h: CELL }
      x += w + 4
    }
  })
  return { cells, width: WIDTH, height: rowKeys.length * CELL }
}

/**
 * Paints every legend into one canvas atlas. Background is the jelly tint and legends are ivory ink,
 * so the map *is* the diffuse colour (the material colour stays white). Waits for the bundled font.
 */
/**
 * Paints the legends twice: a colour map (jelly tint background, ivory ink) and a transmission map (white =
 * clear jelly, black = ink). With fully transmissive caps the colour map alone is invisible, so the
 * transmission map makes the ink opaque: legends read as ivory ink suspended in clear jelly.
 */
export async function paintLegendAtlas(keys: KeyInfo[], layout: AtlasLayout): Promise<{ map: THREE.CanvasTexture; transmissionMap: THREE.CanvasTexture }> {
  try {
    await Promise.all([document.fonts.load('600 40px "Inter Tight"'), document.fonts.load('500 40px "Inter Tight"')])
  } catch { /* falls back to system-ui */ }
  const paint = (background: string, ink: string, srgb: boolean) => {
    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const k of keys) {
      const c = layout.cells[k.index]
      drawLegend(ctx, k.code, c.x, c.y, c.w, c.h, ink)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    texture.anisotropy = 8
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
  }
  return {
    map: paint('#' + PALETTE.jelly.getHexString(), '#' + PALETTE.legend.getHexString(), true),
    transmissionMap: paint('#ffffff', '#000000', false),
  }
}

const FONT = '"Inter Tight", system-ui, sans-serif'

function drawLegend(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, w: number, h: number, ink: string) {
  const L = LEGENDS[code]
  if (!L) return
  // the cap's flat top is roughly the central 65% of its footprint; keep ink well inside it
  const inset = 0.2 * h
  const ix = x + inset, iy = y + inset, iw = w - inset * 2, ih = h - inset * 2
  ctx.save()
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.textBaseline = 'alphabetic'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (L.glyph) {
    drawGlyph(ctx, L.glyph, ix, iy, iw, ih)
  } else if (L.word) {
    ctx.font = `500 ${Math.round(h * 0.125)}px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(L.main, ix + iw * 0.04, iy + ih * 0.9)
  } else if (L.sub) {
    ctx.textAlign = 'left'
    ctx.font = `600 ${Math.round(h * 0.185)}px ${FONT}`
    ctx.fillText(L.sub, ix + iw * 0.07, iy + ih * 0.34)
    ctx.fillText(L.main, ix + iw * 0.07, iy + ih * 0.9)
  } else if (L.main) {
    ctx.font = `600 ${Math.round(h * 0.235)}px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(L.main, ix + iw * 0.07, iy + ih * 0.42)
  }
  ctx.restore()
}

function drawGlyph(ctx: CanvasRenderingContext2D, g: NonNullable<(typeof LEGENDS)[string]['glyph']>, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2, cy = y + h / 2
  const s = h * 0.12
  ctx.lineWidth = h * 0.032
  ctx.beginPath()
  switch (g) {
    case 'up': case 'down': case 'left': case 'right': {
      const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g]
      const px = cx + dir[0] * s, py = cy + dir[1] * s
      ctx.moveTo(cx - dir[0] * s, cy - dir[1] * s)
      ctx.lineTo(px, py)
      const ox = -dir[1], oy = dir[0]
      ctx.moveTo(px - dir[0] * s * 0.75 + ox * s * 0.75, py - dir[1] * s * 0.75 + oy * s * 0.75)
      ctx.lineTo(px, py)
      ctx.lineTo(px - dir[0] * s * 0.75 - ox * s * 0.75, py - dir[1] * s * 0.75 - oy * s * 0.75)
      ctx.stroke()
      break
    }
    case 'backspace': {
      const ax = x + w * 0.96, ay = y + h * 0.9
      ctx.moveTo(ax, ay); ctx.lineTo(ax - s * 2.4, ay)
      ctx.moveTo(ax - s * 1.7, ay - s * 0.75); ctx.lineTo(ax - s * 2.4, ay); ctx.lineTo(ax - s * 1.7, ay + s * 0.75)
      ctx.stroke()
      break
    }
    case 'meta': {
      const r = s * 0.95
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath()
      ctx.stroke()
      break
    }
    default:
      break
  }
}
