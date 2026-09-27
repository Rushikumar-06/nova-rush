// NOVA RUSH - gamepad (standard mapping), polled once per game step so every scene sees the same frame.
// Pad.move / Pad.aim: sticks past a dead zone, {x, y} with length 0..1. Pad.down(b): held. Pad.hit(b): pressed this step.
// Buttons: a b x y lb rb lt rt back start up down left right (up/down/left/right also fire on a left-stick flick, for menus).
// The on-screen touch controls feed it too (Pad.touch).

const Pad = (() => {
  const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 }
  const DEAD = 0.22, FLICK = 0.6
  let now = {}, prev = {}

  function stick(ax = 0, ay = 0, out) {
    const m = Math.hypot(ax, ay), k = m < DEAD ? 0 : Math.min(1, (m - DEAD) / (1 - DEAD)) / m
    out.x = ax * k
    out.y = ay * k
  }

  const pad = {
    connected: false,
    active: false,        // the pad is the device in use: set by pad input, cleared by mouse / keyboard
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    down: b => !!now[b],
    hit: b => !!now[b] && !prev[b],
    poll() {
      const t = prev; prev = now; now = t
      for (const b in now) now[b] = false
      let gp = null
      try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected) { gp = p; break } } catch (e) {}
      pad.connected = !!gp
      stick(gp ? gp.axes[0] : 0, gp ? gp.axes[1] : 0, pad.move)
      stick(gp ? gp.axes[2] : 0, gp ? gp.axes[3] : 0, pad.aim)
      if (gp) {
        let any = pad.move.x || pad.move.y || pad.aim.x || pad.aim.y
        for (const b in BTN) {
          const x = gp.buttons[BTN[b]]
          if ((now[b] = !!x && (x.pressed || x.value > 0.5))) any = true
        }
        now.up = now.up || pad.move.y < -FLICK
        now.down = now.down || pad.move.y > FLICK
        now.left = now.left || pad.move.x < -FLICK
        now.right = now.right || pad.move.x > FLICK
        if (any) { pad.active = true; pad.touch = false }
      }
      if (pad.touch) {
        Object.assign(pad.move, fingers.move)
        Object.assign(pad.aim, fingers.aim)
        for (const b in fingers.tap) { now[b] = true; delete fingers.tap[b] } // one tap = one press
      }
    },
    touch: false,         // the touch screen is the device in use (then active is set too, so play reads it as a pad)
    // The HUD, every frame: the touch layer shows only in play (menus take taps on the canvas). Hiding lets go of the sticks.
    showTouch(on) {
      if (on === layer.classList.contains('on')) return
      layer.classList.toggle('on', on)
      if (!on) for (const id in fingers.held) release(id)
    },
  }

  // Touch: a floating stick under each thumb (left half of the screen moves, right half aims and fires) and DASH / BOMB /
  // pause buttons, in the #touch layer over the canvas (CSS px: thumb-sized on any screen, and usable in the letterbox
  // bars). They read as a pad: sticks -> move / aim, buttons -> lb / rb / start (their data-btn).
  const TRAVEL = 60 // px a knob can move from where the thumb landed
  const fingers = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, tap: {}, held: {} } // held: touch id -> { side, x0, y0 }
  const layer = document.getElementById('touch')
  const sticks = { move: document.getElementById('stickL'), aim: document.getElementById('stickR') }
  function release(id) {
    const h = fingers.held[id]
    if (!h) return
    delete fingers.held[id]
    fingers[h.side].x = fingers[h.side].y = 0
    sticks[h.side].className = 'stick'
    sticks[h.side].style.cssText = sticks[h.side].firstElementChild.style.cssText = '' // back to its resting spot
  }
  layer.addEventListener('touchstart', e => {
    e.preventDefault() // no emulated mouse events, and Phaser ignores it
    for (const t of e.changedTouches) {
      if (t.target.dataset.btn) { fingers.tap[t.target.dataset.btn] = true; continue }
      const side = t.clientX < innerWidth / 2 ? 'move' : 'aim'
      if (Object.values(fingers.held).some(h => h.side === side)) continue // one thumb per stick
      fingers.held[t.identifier] = { side, x0: t.clientX, y0: t.clientY }
      sticks[side].style.cssText = `left: ${t.clientX}px; top: ${t.clientY}px`
      sticks[side].classList.add('held')
    }
  }, { passive: false })
  layer.addEventListener('touchmove', e => {
    e.preventDefault()
    for (const t of e.changedTouches) {
      const h = fingers.held[t.identifier]
      if (!h) continue
      let dx = t.clientX - h.x0, dy = t.clientY - h.y0
      const d = Math.hypot(dx, dy), m = Math.min(d, TRAVEL)
      if (d > TRAVEL) { dx *= TRAVEL / d; dy *= TRAVEL / d }
      sticks[h.side].firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`
      const out = fingers[h.side]
      if (h.side === 'move') { const k = d < 6 ? 0 : 1 / TRAVEL; out.x = dx * k; out.y = dy * k } // analog, like a pad stick
      else if (d > 10) { out.x = dx / m; out.y = dy / m } // full tilt fires; held near the center it keeps its last aim
    }
  }, { passive: false })
  const end = e => { e.preventDefault(); for (const t of e.changedTouches) release(t.identifier) }
  layer.addEventListener('touchend', end, { passive: false })
  layer.addEventListener('touchcancel', end, { passive: false })

  // The last device used wins. A tap also fires emulated mouse events a moment later: those don't count.
  let touchAt = -1e9
  const off = () => { pad.active = pad.touch = false }
  window.addEventListener('touchstart', () => { touchAt = performance.now(); pad.active = pad.touch = true }, true)
  window.addEventListener('mousemove', () => { if (performance.now() - touchAt > 1000) off() }, true)
  window.addEventListener('keydown', off, true)
  return pad
})()
