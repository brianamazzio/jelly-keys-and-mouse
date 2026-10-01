import * as THREE from 'three'
import type { KeyInfo } from './layout'

const PITCH = 0.01905
const SUB = 1 / 240
const FIELD_W = 64
const FIELD_H = 28
const SAG_MM = 1.5 // plate sag under a fully pressed key
const PUSH_MM = 0.7 // sideways bulge of the case wall beside a sag
const SAG_SIGMA = 1.5 * PITCH

/** A damped spring with a clamp. Used for the whole-board modes. */
class Mode {
  x = 0
  v = 0
  readonly k: number
  readonly zeta: number
  readonly lim: number
  constructor(k: number, zeta: number, lim: number) {
    this.k = k
    this.zeta = zeta
    this.lim = lim
  }
  step(h: number) {
    const a = -this.k * this.x - 2 * this.zeta * Math.sqrt(this.k) * this.v
    this.v += a * h
    this.x += this.v * h
    if (this.x > this.lim) { this.x = this.lim; if (this.v > 0) this.v *= -0.3 }
    if (this.x < -this.lim) { this.x = -this.lim; if (this.v < 0) this.v *= -0.3 }
  }
  energy(scale: number) { return (Math.abs(this.x) + Math.abs(this.v) * 0.05) * scale }
}

/**
 * Per-key spring state. Nothing here is a soft-body solver: each cap has
 *  - a press spring (critically damped going down, under-damped coming back => gelatin recovery)
 *  - a touch position + touch amount (where the finger is, how much it is pressing)
 *  - a 3-DOF wobble spring (lateral shear + vertical bounce) excited by impulses
 * Neighbouring caps receive distance-weighted impulses so the material feels shared.
 * Stiffness is jittered per key and impulse directions are randomised so no two presses look identical.
 *
 * The board itself is jelly too: every frame the key presses are splatted into a coarse field over the
 * keyboard footprint (sag + sideways push, half-float texture), and five whole-board spring modes
 * (bounce, sway x/z, rock x/z) are kicked by each press and release at that key's position.
 */
export class KeyboardSim {
  readonly n: number
  readonly texture: THREE.DataTexture
  private data: Float32Array
  private press: Float32Array
  private pressV: Float32Array
  private held: Uint8Array
  private touchX: Float32Array
  private touchZ: Float32Array
  private touchTX: Float32Array
  private touchTZ: Float32Array
  private amt: Float32Array
  private amtV: Float32Array
  private wob: Float32Array // x,z,y interleaved
  private wobV: Float32Array
  private jit: Float32Array
  private neighbors: { j: number; w: number; dx: number; dz: number }[][]
  private awake = true
  private acc = 0

  /** whole-board modes */
  readonly bounce = new Mode(230, 0.1, 0.002)
  readonly swayX = new Mode(190, 0.1, 0.0012)
  readonly swayZ = new Mode(210, 0.1, 0.0012)
  readonly rockX = new Mode(260, 0.1, 0.012)
  readonly rockZ = new Mode(300, 0.1, 0.02)
  readonly fieldTexture: THREE.DataTexture
  /** minX, minZ, sizeX, sizeZ of the field in keyboard space */
  readonly fieldRect: THREE.Vector4
  private field: Uint16Array
  private fieldF: Float32Array
  private halfX: number
  private halfZ: number
  private fieldClean = false
  /** called on every new press (+1) and release (-1), for the desk ripples */
  onImpulse?: (index: number, sign: number) => void

  readonly keys: KeyInfo[]
  constructor(keys: KeyInfo[]) {
    this.keys = keys
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const k of keys) {
      minX = Math.min(minX, k.min[0]); maxX = Math.max(maxX, k.max[0])
      minZ = Math.min(minZ, k.min[2]); maxZ = Math.max(maxZ, k.max[2])
    }
    const m = 0.014
    this.fieldRect = new THREE.Vector4(minX - m, minZ - m, maxX - minX + 2 * m, maxZ - minZ + 2 * m)
    this.halfX = (maxX - minX) / 2
    this.halfZ = (maxZ - minZ) / 2
    this.field = new Uint16Array(FIELD_W * FIELD_H * 4)
    this.fieldF = new Float32Array(FIELD_W * FIELD_H * 4)
    this.fieldTexture = new THREE.DataTexture(this.field, FIELD_W, FIELD_H, THREE.RGBAFormat, THREE.HalfFloatType)
    this.fieldTexture.minFilter = this.fieldTexture.magFilter = THREE.LinearFilter
    this.fieldTexture.wrapS = this.fieldTexture.wrapT = THREE.ClampToEdgeWrapping
    this.fieldTexture.needsUpdate = true
    const n = (this.n = keys.length)
    this.data = new Float32Array(n * 2 * 4)
    this.texture = new THREE.DataTexture(this.data, n, 2, THREE.RGBAFormat, THREE.FloatType)
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter
    this.texture.needsUpdate = true
    this.press = new Float32Array(n)
    this.pressV = new Float32Array(n)
    this.held = new Uint8Array(n)
    this.touchX = new Float32Array(n)
    this.touchZ = new Float32Array(n)
    this.touchTX = new Float32Array(n)
    this.touchTZ = new Float32Array(n)
    this.amt = new Float32Array(n)
    this.amtV = new Float32Array(n)
    this.wob = new Float32Array(n * 3)
    this.wobV = new Float32Array(n * 3)
    this.jit = new Float32Array(n)
    for (let i = 0; i < n; i++) this.jit[i] = 0.88 + Math.random() * 0.24
    this.neighbors = keys.map((a) => {
      const list: { j: number; w: number; dx: number; dz: number }[] = []
      for (const b of keys) {
        if (b.index === a.index) continue
        const dx = b.center[0] - a.center[0], dz = b.center[2] - a.center[2]
        const d = Math.hypot(dx, dz) / PITCH
        if (d > 2.6) continue
        const w = Math.exp(-(d - 1) / 0.9)
        list.push({ j: b.index, w, dx: dx / (d * PITCH), dz: dz / (d * PITCH) })
      }
      return list
    })
    for (let i = 0; i < n; i++) this.data[n * 4 + i * 4 + 3] = Math.random()
  }

  /** tx/tz are normalised touch offsets from the cap centre (-0.5..0.5). */
  pressKey(i: number, tx: number, tz: number) {
    if (this.held[i]) {
      this.touchTX[i] = tx; this.touchTZ[i] = tz
      return
    }
    this.held[i] = 1
    this.touchTX[i] = this.touchX[i] = tx
    this.touchTZ[i] = this.touchZ[i] = tz
    // the top slumps toward the finger; a little randomness so repeats differ
    const a = (Math.random() - 0.5) * 0.6
    const c = Math.cos(a), s = Math.sin(a)
    const kx = tx * c - tz * s, kz = tx * s + tz * c
    this.wobV[i * 3] += kx * 0.05
    this.wobV[i * 3 + 1] += kz * 0.05
    this.wobV[i * 3 + 2] -= 0.01
    this.kickNeighbors(i, -1)
    this.kickBoard(i, -1)
    this.onImpulse?.(i, 1)
    this.awake = true
  }

  releaseKey(i: number) {
    if (!this.held[i]) return
    this.held[i] = 0
    const a = Math.random() * Math.PI * 2
    this.wobV[i * 3] += Math.cos(a) * 0.012
    this.wobV[i * 3 + 1] += Math.sin(a) * 0.012
    this.wobV[i * 3 + 2] += 0.045 + Math.random() * 0.02
    this.kickNeighbors(i, 1)
    this.kickBoard(i, 1)
    this.onImpulse?.(i, -1)
    this.awake = true
  }

  /** A press pushes the board down and tips it toward that key; the release throws it back past rest. */
  private kickBoard(i: number, sign: number) {
    const k = this.keys[i]
    const nx = (k.center[0] - (this.fieldRect.x + this.fieldRect.z / 2)) / this.halfX
    const nz = (k.center[2] - (this.fieldRect.y + this.fieldRect.w / 2)) / this.halfZ
    const j = 0.75 + Math.random() * 0.5
    if (sign < 0) {
      this.bounce.v -= 0.014 * j
      this.rockX.v -= nx * 0.07 * j
      this.rockZ.v -= nz * 0.15 * j
    } else {
      this.bounce.v += 0.022 * j
      this.rockX.v += nx * 0.09 * j
      this.rockZ.v += nz * 0.2 * j
    }
    const a = Math.random() * Math.PI * 2
    this.swayX.v += Math.cos(a) * 0.004 * j + nx * 0.003 * sign
    this.swayZ.v += Math.sin(a) * 0.004 * j + nz * 0.003 * sign
  }

  releaseAll() {
    for (let i = 0; i < this.n; i++) if (this.held[i]) this.releaseKey(i)
  }

  isHeld(i: number) { return this.held[i] === 1 }

  private kickNeighbors(i: number, sign: number) {
    for (const nb of this.neighbors[i]) {
      const rot = (Math.random() - 0.5) * 0.7
      const c = Math.cos(rot), s = Math.sin(rot)
      const dx = nb.dx * c - nb.dz * s, dz = nb.dx * s + nb.dz * c
      const m = 0.011 * nb.w
      this.wobV[nb.j * 3] += dx * m * -sign
      this.wobV[nb.j * 3 + 1] += dz * m * -sign
      this.wobV[nb.j * 3 + 2] += sign > 0 ? 0.016 * nb.w : -0.012 * nb.w
      // tiny sympathetic dip through the shared plate
      this.pressV[nb.j] += sign > 0 ? -0.9 * nb.w : 0.9 * nb.w
    }
  }

  update(dt: number) {
    if (!this.awake) return
    this.acc += Math.min(dt, 0.05)
    while (this.acc >= SUB) {
      this.step(SUB)
      this.acc -= SUB
    }
    this.write()
  }

  private step(h: number) {
    const n = this.n
    let energy = 0
    for (let i = 0; i < n; i++) {
      const held = this.held[i] === 1
      const jit = this.jit[i]
      // press spring
      const kP = 1500 * jit
      const zP = held ? 0.95 : 0.22
      const cP = 2 * zP * Math.sqrt(kP)
      const target = held ? 1 : 0
      let a = -kP * (this.press[i] - target) - cP * this.pressV[i]
      this.pressV[i] += a * h
      this.press[i] += this.pressV[i] * h
      if (this.press[i] > 1.04) { this.press[i] = 1.04; if (this.pressV[i] > 0) this.pressV[i] *= -0.3 }
      if (this.press[i] < -0.18) { this.press[i] = -0.18; if (this.pressV[i] < 0) this.pressV[i] *= -0.3 }
      // touch follows the finger, amount eases in/out
      const f = 1 - Math.exp(-h * 45)
      this.touchX[i] += (this.touchTX[i] - this.touchX[i]) * f
      this.touchZ[i] += (this.touchTZ[i] - this.touchZ[i]) * f
      const kA = 900, cA = 2 * 0.9 * Math.sqrt(kA)
      a = -kA * (this.amt[i] - target) - cA * this.amtV[i]
      this.amtV[i] += a * h
      this.amt[i] += this.amtV[i] * h
      // wobble springs (x, z lateral; y vertical)
      const kW = 720 * jit, cW = 2 * 0.11 * Math.sqrt(kW)
      const kWy = 1000 * jit, cWy = 2 * 0.14 * Math.sqrt(kWy)
      for (let k = 0; k < 3; k++) {
        const idx = i * 3 + k
        const kk = k === 2 ? kWy : kW, cc = k === 2 ? cWy : cW
        a = -kk * this.wob[idx] - cc * this.wobV[idx]
        this.wobV[idx] += a * h
        this.wob[idx] += this.wobV[idx] * h
        // never let secondary motion exceed a couple of millimetres
        const lim = k === 2 ? 0.0022 : 0.0028
        if (this.wob[idx] > lim) { this.wob[idx] = lim; this.wobV[idx] *= 0.5 }
        if (this.wob[idx] < -lim) { this.wob[idx] = -lim; this.wobV[idx] *= 0.5 }
        energy += Math.abs(this.wob[idx]) * 400 + Math.abs(this.wobV[idx]) * 4
      }
      energy += Math.abs(this.press[i] - target) + Math.abs(this.pressV[i]) * 0.1 + Math.abs(this.amt[i] - target)
    }
    for (const mode of [this.bounce, this.swayX, this.swayZ]) { mode.step(h); energy += mode.energy(400) }
    for (const mode of [this.rockX, this.rockZ]) { mode.step(h); energy += mode.energy(60) }
    if (energy < 0.002) {
      this.awake = false
      for (let i = 0; i < n; i++) if (this.held[i]) { this.awake = true; break }
    }
  }

  private write() {
    const n = this.n, d = this.data
    for (let i = 0; i < n; i++) {
      d[i * 4] = this.press[i]
      d[i * 4 + 1] = this.touchX[i]
      d[i * 4 + 2] = this.touchZ[i]
      d[i * 4 + 3] = this.amt[i]
      d[n * 4 + i * 4] = this.wob[i * 3]
      d[n * 4 + i * 4 + 1] = this.wob[i * 3 + 1]
      d[n * 4 + i * 4 + 2] = this.wob[i * 3 + 2]
    }
    this.texture.needsUpdate = true
    this.writeField()
  }

  /** Splat every moving key into the sag/push field (millimetres, half float). */
  private writeField() {
    const f = this.fieldF
    f.fill(0)
    const r = this.fieldRect
    const inv2s2 = 1 / (2 * SAG_SIGMA * SAG_SIGMA)
    const cut = 3 * SAG_SIGMA
    let any = false
    for (let i = 0; i < this.n; i++) {
      const p = this.press[i]
      if (Math.abs(p) < 1e-4) continue
      any = true
      const k = this.keys[i]
      const x0 = Math.max(0, Math.floor(((k.center[0] - cut - r.x) / r.z) * FIELD_W))
      const x1 = Math.min(FIELD_W - 1, Math.ceil(((k.center[0] + cut - r.x) / r.z) * FIELD_W))
      const z0 = Math.max(0, Math.floor(((k.center[2] - cut - r.y) / r.w) * FIELD_H))
      const z1 = Math.min(FIELD_H - 1, Math.ceil(((k.center[2] + cut - r.y) / r.w) * FIELD_H))
      for (let zi = z0; zi <= z1; zi++) {
        const cz = r.y + ((zi + 0.5) / FIELD_H) * r.w - k.center[2]
        for (let xi = x0; xi <= x1; xi++) {
          const cx = r.x + ((xi + 0.5) / FIELD_W) * r.z - k.center[0]
          const g = Math.exp(-(cx * cx + cz * cz) * inv2s2) * p
          const o = (zi * FIELD_W + xi) * 4
          f[o] += g * SAG_MM
          f[o + 1] += (cx / SAG_SIGMA) * g * PUSH_MM
          f[o + 2] += (cz / SAG_SIGMA) * g * PUSH_MM
        }
      }
    }
    if (!any && this.fieldClean) return
    this.fieldClean = !any
    const h = this.field
    for (let o = 0; o < f.length; o++) h[o] = THREE.DataUtils.toHalfFloat(f[o])
    this.fieldTexture.needsUpdate = true
  }
}
