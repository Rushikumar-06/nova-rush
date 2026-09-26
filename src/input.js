// NOVA RUSH - gamepad (standard mapping), polled once per game step so every scene sees the same frame.
// Pad.move / Pad.aim: sticks past a dead zone, {x, y} with length 0..1. Pad.down(b): held. Pad.hit(b): pressed this step.
// Buttons: a b x y lb rb lt rt back start up down left right (up/down/left/right also fire on a left-stick flick, for menus).

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
      if (!gp) return
      let any = pad.move.x || pad.move.y || pad.aim.x || pad.aim.y
      for (const b in BTN) {
        const x = gp.buttons[BTN[b]]
        if ((now[b] = !!x && (x.pressed || x.value > 0.5))) any = true
      }
      now.up = now.up || pad.move.y < -FLICK
      now.down = now.down || pad.move.y > FLICK
      now.left = now.left || pad.move.x < -FLICK
      now.right = now.right || pad.move.x > FLICK
      if (any) pad.active = true
    },
  }
  const off = () => { pad.active = false }
  window.addEventListener('mousemove', off, true)
  window.addEventListener('keydown', off, true)
  return pad
})()
