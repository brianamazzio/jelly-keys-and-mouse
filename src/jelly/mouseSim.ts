import * as THREE from 'three'

const SUB = 1 / 240

class Spring {
  x = 0
  v = 0
  step(h: number, target: number, k: number, zeta: number) {
    const c = 2 * zeta * Math.sqrt(k)
    const a = -k * (this.x - target) - c * this.v
    this.v += a * h
    this.x += this.v * h
  }
  clamp(lo: number, hi: number) {
    if (this.x > hi) { this.x = hi; if (this.v > 0) this.v *= -0.3 }
    if (this.x < lo) { this.x = lo; if (this.v < 0) this.v *= -0.3 }
  }
  energy(target = 0) { return Math.abs(this.x - target) + Math.abs(this.v) * 0.05 }
}

class Button {
  held = false
  click = new Spring() // rigid switch travel
  dent = new Spring() // jelly skin around the fingertip
  touch = new THREE.Vector3()
  target = new THREE.Vector3()
}

/**
 * Mouse interaction state. Buttons have a stiff "click" spring that bottoms out and a softer "dent"
 * spring for the skin; squeezing builds up while any button is held; the wheel has inertia, detents
 * and its own compression spring. Body wobble is a 3-DOF spring kicked by every event.
 */
export class MouseSim {
  left = new Button()
  right = new Button()
  squeeze = new Spring()
  wheelAngle = 0
  wheelVel = 0
  wheelComp = new Spring()
  wob = [new Spring(), new Spring(), new Spring()] // x, y, z
  private acc = 0
  private awake = true
  /** called on every new press (+1) and release (-1), for the desk ripples */
  onImpulse?: (sign: number) => void

  pressButton(side: 'left' | 'right', localPoint: THREE.Vector3) {
    const b = side === 'left' ? this.left : this.right
    b.target.copy(localPoint)
    if (!b.held) { b.touch.copy(localPoint); this.onImpulse?.(1) }
    b.held = true
    this.wob[1].v -= 0.012
    this.wob[0].v += (side === 'left' ? -1 : 1) * 0.006 * (0.6 + Math.random() * 0.8)
    this.wob[2].v += (Math.random() - 0.5) * 0.006
    this.awake = true
  }

  moveButton(side: 'left' | 'right', localPoint: THREE.Vector3) {
    const b = side === 'left' ? this.left : this.right
    if (b.held) b.target.copy(localPoint)
  }

  releaseButton(side: 'left' | 'right') {
    const b = side === 'left' ? this.left : this.right
    if (!b.held) return
    b.held = false
    this.onImpulse?.(-1)
    this.wob[1].v += 0.028 + Math.random() * 0.012
    this.wob[0].v += (side === 'left' ? 1 : -1) * 0.008 * (0.6 + Math.random() * 0.8)
    this.wob[2].v += (Math.random() - 0.5) * 0.01
    this.awake = true
  }

  releaseAll() { this.releaseButton('left'); this.releaseButton('right') }

  scroll(deltaY: number) {
    const d = THREE.MathUtils.clamp(deltaY, -120, 120)
    this.wheelVel += d * 0.11
    this.wheelComp.v += Math.min(Math.abs(d), 100) * 0.028
    this.wob[2].v += -d * 0.00008
    this.awake = true
  }

  update(dt: number) {
    if (!this.awake) return
    this.acc += Math.min(dt, 0.05)
    while (this.acc >= SUB) { this.step(SUB); this.acc -= SUB }
  }

  private step(h: number) {
    let e = 0
    for (const b of [this.left, this.right]) {
      const t = b.held ? 1 : 0
      b.click.step(h, t, 2600, b.held ? 1.0 : 0.55)
      b.click.clamp(-0.05, 1.02)
      b.dent.step(h, t, 620, b.held ? 0.7 : 0.16)
      b.dent.clamp(-0.35, 1.25)
      const f = 1 - Math.exp(-h * 40)
      b.touch.lerp(b.target, f)
      e += b.click.energy(t) + b.dent.energy(t)
    }
    const holding = this.left.held || this.right.held
    this.squeeze.step(h, holding ? 1 : 0, holding ? 55 : 320, holding ? 1.0 : 0.18)
    this.squeeze.clamp(-0.3, 1.1)
    e += this.squeeze.energy(holding ? 1 : 0)
    // wheel: inertia, friction, 24 detents, compression
    const detent = -Math.sin(this.wheelAngle * 24) * 9
    this.wheelVel += detent * h
    this.wheelVel *= Math.exp(-h * 7)
    this.wheelAngle += this.wheelVel * h
    this.wheelComp.step(h, 0, 900, 0.22)
    this.wheelComp.clamp(-0.3, 1)
    e += Math.abs(this.wheelVel) * 0.05 + this.wheelComp.energy()
    // body wobble
    this.wob[0].step(h, 0, 520, 0.14)
    this.wob[1].step(h, 0, 780, 0.16)
    this.wob[2].step(h, 0, 520, 0.14)
    for (const w of this.wob) { w.clamp(-0.0025, 0.0025); e += w.energy() * 300 }
    if (e < 0.002 && !holding) this.awake = false
  }
}
