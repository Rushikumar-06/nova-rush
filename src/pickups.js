// NOVA RUSH - power-ups dropped by kills (and 3 per mothership): rapid fire, spread shot, shield, extra bomb.
// A pickup is an Image with type, life (s left) and t (animation clock). Near the ship it is pulled in.

const Pickups = (() => {
  const P = CONFIG.pickups, TAU = Math.PI * 2
  const COLOR = { rapid: COLORS.rapid, spread: COLORS.spread, shield: COLORS.shield, bomb: COLORS.accent }

  function pick() {
    let roll = Math.random() * Object.values(P.weights).reduce((a, b) => a + b, 0)
    for (const k in P.weights) if ((roll -= P.weights[k]) <= 0) return k
    return 'rapid'
  }

  return {
    COLOR,

    init(scene) {
      scene.pickups = []
      scene.power = { rapid: 0, spread: 0 } // s left on each timed power-up
      scene.shield = false
    },

    maybeDrop(scene, e) {
      if (Math.random() < (e.kind === 'splitter' || e.kind === 'brute' ? P.splitterChance : P.chance)) Pickups.drop(scene, e.x, e.y)
    },

    // force: mothership drops ignore the on-screen cap
    drop(scene, x, y, type = pick(), force = false) {
      if (!force && scene.pickups.length >= P.max) return null
      const { w, h } = CONFIG.arena, r = P.radius + 8
      const o = scene.add.image(Phaser.Math.Clamp(x, r, w - r), Phaser.Math.Clamp(y, r, h - r), 'pu_' + type).setDepth(12)
      o.type = type
      o.life = P.life
      o.t = Math.random() * TAU
      scene.pickups.push(o)
      return o
    },

    update(scene, dt) {
      scene.power.rapid = Math.max(0, scene.power.rapid - dt)
      scene.power.spread = Math.max(0, scene.power.spread - dt)
      const p = scene.player, list = scene.pickups, alive = p.visible // no collecting while the ship is wrecked
      const reach = P.magnet * scene.mods.magnet // the tractor beam upgrade widens it
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i]
        o.life -= dt
        o.t += dt
        o.setScale(1 + Math.sin(o.t * 5) * 0.08).setRotation(Math.sin(o.t * 2) * 0.25)
        o.setAlpha(o.life < 3 && Math.floor(o.life * 8) % 2 ? 0.25 : 1)
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy)
        if (alive && d > 0 && d < reach) { const k = (1 - d / reach) * 700 * dt / d; o.x += dx * k; o.y += dy * k }
        if (alive && d < CONFIG.player.radius + P.radius) { Pickups.apply(scene, o.type, o.x, o.y); scene.stats.pickups++ }
        else if (o.life > 0) continue
        o.destroy()
        list.splice(i, 1)
      }
    },

    apply(scene, type, x, y) {
      if (type === 'bomb') scene.bombs++
      else if (type === 'shield') scene.shield = true
      else scene.power[type] = P.duration * scene.mods.duration
      FX.collect(scene, x, y, COLOR[type])
      SFX.play('powerup')
      scene.events.emit('powerup', type)
    },
  }
})()
