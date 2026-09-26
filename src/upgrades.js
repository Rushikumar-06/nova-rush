// NOVA RUSH - roguelite upgrades: after every mothership the pilot picks 1 of 3 cards (UpgradeScene), so each run
// builds differently. Most upgrades bump GameScene.mods (game.js / pickups.js read them live); wing drones, seeker
// missiles and the aegis shield run here. Icons are 'up_' + id; every card label is painted at boot.

const Upgrades = (() => {
  const TAU = Math.PI * 2
  const DRONE = { orbit: 46, spin: 2.2, every: 0.45, range: 560 } // px from the ship, rad/s, s per shot (/ mods.fireRate), px
  // speed px/s at launch -> maxSpeed; turn rad/s, growing with age so a missile can't circle its target; puff: s per exhaust puff
  const MISSILE = { every: 2.5, damage: 3, speed: 260, maxSpeed: 900, accel: 1600, turn: 4, life: 2.8, radius: 6, puff: 0.016 }

  // weight: odds of being offered; max: stacks (Infinity = repeatable); desc[n]: the card text once n are owned;
  // glyph: the icon's white line art, within about +-14 px
  const POOL = [
    { id: 'overdrive', name: 'OVERDRIVE', color: 0xff9a1f, max: 3, weight: 1, desc: '+25% fire rate',
      apply: s => { s.mods.fireRate += 0.25 },
      glyph: c => poly(c, [[3, -14], [-8, 2], [-1, 2], [-4, 14], [8, -3], [1, -3]]) },
    { id: 'pierce', name: 'PIERCING ROUNDS', color: 0xc6ff3d, max: 3, weight: 1, desc: 'Bullets pass through\none more enemy',
      apply: s => { s.mods.pierce++ },
      glyph: c => { c.moveTo(-14, 0); c.lineTo(13, 0); c.moveTo(7, -6); c.lineTo(13, 0); c.lineTo(7, 6); for (const x of [-7, 0]) { c.moveTo(x, -11); c.lineTo(x, -4); c.moveTo(x, 4); c.lineTo(x, 11) } } }, // arrow punched through two plates
    { id: 'ricochet', name: 'RICOCHET', color: 0x2dffd0, max: 2, weight: 0.8, desc: 'Bullets bounce off\nthe walls once more',
      apply: s => { s.mods.ricochet++ },
      glyph: c => { c.moveTo(11, -14); c.lineTo(11, 14); c.moveTo(-13, -10); c.lineTo(7, 0); c.lineTo(-13, 10); c.moveTo(-9, 4.3); c.lineTo(-13, 10); c.lineTo(-6, 10.3) } },
    { id: 'heavy', name: 'HEAVY ROUNDS', color: 0xff4fa3, max: 2, weight: 0.7, desc: '+1 damage to\narmored enemies',
      apply: s => { s.mods.damage++ },
      glyph: c => { c.moveTo(-6, 13); c.lineTo(-6, -2); c.quadraticCurveTo(-6, -10, 0, -14); c.quadraticCurveTo(6, -10, 6, -2); c.lineTo(6, 13); c.closePath(); c.moveTo(-6, 6); c.lineTo(6, 6) } },
    { id: 'drone', name: 'WING DRONE', color: COLORS.player, max: 2, weight: 1,
      desc: ['A drone orbits the ship and\nshoots the nearest enemy', 'A second wing drone'],
      apply: s => { s._up.drones.push(addDrone(s)) },
      glyph: c => { c.moveTo(12, 0); c.arc(0, 0, 12, 0, TAU); poly(c, [[0, -5], [4.5, 4], [-4.5, 4]]); poly(c, [[8.5, -13], [13, -8.5], [8.5, -4], [4, -8.5]]) } },
    { id: 'missiles', name: 'SEEKER MISSILES', color: COLORS.warning, max: 2, weight: 1,
      desc: ['A homing missile at the\nnearest enemy every 2.5 s', 'Missiles launch\nin pairs'],
      apply: s => { s._up.missiles++ },
      glyph: c => { c.rotate(Math.PI / 4); poly(c, [[0, -14], [3.5, -8], [3.5, 5], [-3.5, 5], [-3.5, -8]]); poly(c, [[-3.5, -1], [-8, 7], [-3.5, 5]]); poly(c, [[3.5, -1], [8, 7], [3.5, 5]]); c.moveTo(0, 8); c.lineTo(0, 13); c.rotate(-Math.PI / 4) } },
    { id: 'afterburner', name: 'AFTERBURNER', color: 0x3d8bff, max: 2, weight: 0.8, desc: '+12% speed,\n-25% dash cooldown',
      apply: s => { s.mods.speed += 0.12; s.mods.dashCooldown *= 0.75 },
      glyph: c => { c.moveTo(2, -10); c.lineTo(12, 0); c.lineTo(2, 10); for (const [x, y] of [[-6, -6], [-13, 0], [-6, 6]]) { c.moveTo(x, y); c.lineTo(0, y) } } },
    { id: 'tractor', name: 'TRACTOR BEAM', color: 0xd94dff, max: 1, weight: 0.7, desc: 'Double pickup reach,\npower-ups last 50% longer',
      apply: s => { s.mods.magnet *= 2; s.mods.duration *= 1.5 },
      glyph: c => { c.moveTo(-10, -12); c.lineTo(-10, 0); c.arc(0, 0, 10, Math.PI, 0, true); c.lineTo(10, -12); c.moveTo(-14, -12); c.lineTo(-6, -12); c.moveTo(6, -12); c.lineTo(14, -12) } },
    { id: 'hull', name: 'HULL PLATING', color: 0x39ff6a, max: Infinity, weight: 0.6, desc: '+1 life',
      apply: s => { s.lives++ },
      glyph: c => { c.moveTo(0, -12); c.lineTo(0, 12); c.moveTo(-12, 0); c.lineTo(12, 0) } },
    { id: 'bombbay', name: 'BOMB BAY', color: COLORS.accent, max: Infinity, weight: 0.6, desc: '+2 bombs',
      apply: s => { s.bombs += 2 },
      glyph: c => { for (const x of [-8, 8]) { c.moveTo(x + 5, 5); c.arc(x, 5, 5, 0, TAU); c.moveTo(x + 1.5, 5); c.arc(x, 5, 1.5, 0, TAU) } c.moveTo(0, -14); c.lineTo(0, -4); c.moveTo(-5, -9); c.lineTo(5, -9) } }, // two HUD bombs, plus
    { id: 'aegis', name: 'AEGIS', color: COLORS.shield, max: 1, weight: 0.8, desc: 'A shield now and at the\nstart of every sector',
      apply: s => { s._up.aegis = true; s.shield = true },
      glyph: c => { poly(c, [[0, -14], [11, -9], [9, 4], [0, 14], [-9, 4], [-11, -9]]); poly(c, [[0, -7], [5, -4.5], [4, 2], [0, 7], [-4, 2], [-5, -4.5]]) } },
  ]

  // Card labels as uiLabel args. All painted at boot: a blurred label can take ~140 ms to build in Firefox.
  const LABEL = {
    title: () => ['CHOOSE AN UPGRADE', 52, '#ffffff', { glow: uiHex(COLORS.accent), blur: 22, spacing: 10, weight: '900' }],
    hint: () => ['CLICK A CARD   ·   KEYS 1 2 3   ·   ARROWS + ENTER   ·   D-PAD + A', 15, '#6f93bd', { blur: 0, spacing: 3 }],
    name: u => [u.name, 24, '#ffffff', { glow: uiHex(u.color), blur: 12, spacing: 3, weight: '900' }],
    desc: str => [str, 18, '#a9c8ea', { blur: 0, align: 'center', lineSpacing: 6, weight: '500' }],
  }
  const descs = u => [].concat(u.desc)
  const count = (scene, id) => scene.upgrades.reduce((n, x) => n + (x === id), 0)

  // House neon recipe, replicated from fx.js: faint wide halos -> blurred color line -> pale hot core.
  const hex = c => '#' + c.toString(16).padStart(6, '0')
  const mix = (a, b, t) => [16, 8, 0].reduce((c, s) => c | Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s, 0)
  function poly(c, pts) { c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath() }
  function canvasTex(scene, key, w, h, draw) {
    const tex = scene.textures.createCanvas(key, w, h), c = tex.context
    c.translate(w / 2, h / 2)
    c.lineJoin = c.lineCap = 'round'
    draw(c)
    tex.refresh()
  }
  function neon(c, color, lw, fill = 0.14) {
    c.globalCompositeOperation = 'lighter'
    c.fillStyle = c.strokeStyle = c.shadowColor = hex(color)
    if (fill) { c.globalAlpha = fill; c.fill() }
    for (const [w, a, blur] of [[lw * 5, 0.08, 0], [lw * 3, 0.16, 0], [lw * 1.5, 1, 10]]) {
      c.lineWidth = w; c.globalAlpha = a; c.shadowBlur = blur; c.stroke()
    }
    c.shadowBlur = 0; c.globalAlpha = 1
    c.strokeStyle = hex(mix(color, 0xffffff, 0.65)); c.lineWidth = lw * 0.6; c.stroke()
  }

  // up to 3 different upgrades, weighted, never one already maxed out
  function roll(scene) {
    const left = POOL.filter(u => count(scene, u.id) < u.max), out = []
    while (out.length < 3 && left.length) {
      let r = Math.random() * left.reduce((s, u) => s + u.weight, 0), i = 0
      while (i < left.length - 1 && (r -= left[i].weight) > 0) i++
      out.push(left.splice(i, 1)[0])
    }
    return out
  }

  function addDrone(scene) {
    const d = scene.add.image(0, 0, 'upDrone').setDepth(19).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    d.cd = 0
    return d
  }

  // ship wrecked: drones vanish with it, missiles in flight are dropped
  function hide(u) {
    for (const d of u.drones) d.setVisible(false)
    for (const m of u.live) { m.setVisible(false); u.pool.push(m) }
    u.live.length = 0
  }

  function nearest(scene, x, y, range) {
    const list = scene.enemies
    let best = null, bd = range * range
    for (let i = 0; i < list.length; i++) {
      const e = list[i], d = (e.x - x) ** 2 + (e.y - y) ** 2
      if (e.telegraph <= 0 && d < bd) { bd = d; best = e }
    }
    return best
  }

  // A drone orbits the ship and, when reloaded, leads a shot at the nearest enemy in range.
  function droneStep(scene, d, a, dt) {
    const p = scene.player
    d.setPosition(p.x + Math.cos(a) * DRONE.orbit, p.y + Math.sin(a) * DRONE.orbit).setVisible(true)
    if ((d.cd -= dt) > 0) return
    const e = nearest(scene, d.x, d.y, DRONE.range)
    if (!e) { d.rotation = p.rotation; return }
    const t = Math.hypot(e.x - d.x, e.y - d.y) / (CONFIG.weapon.bulletSpeed * scene.mods.bulletSpeed)
    d.rotation = Math.atan2(e.y + e.vy * t - d.y, e.x + e.vx * t - d.x)
    scene.addBullet(d.x + Math.cos(d.rotation) * 10, d.y + Math.sin(d.rotation) * 10, d.rotation)
    if (!CONFIG.low) FX.muzzle(scene, d.x, d.y, COLORS.player)
    d.cd = DRONE.every / scene.mods.fireRate
  }

  // Seeker missiles peel off the wings (one: alternating sides; two stacks: a pair), then home in.
  function launch(scene, u) {
    const p = scene.player, e = nearest(scene, p.x, p.y, Infinity)
    if (!e) return // the timer stays run out: fires as soon as something shows up
    u.missileT = MISSILE.every
    for (let k = 0; k < u.missiles; k++) {
      const side = u.missiles > 1 ? 2 * k - 1 : (u.side = -u.side)
      const m = u.pool.pop() || scene.add.image(0, 0, 'upMissile').setDepth(16).setBlendMode(Phaser.BlendModes.ADD)
      const out = p.rotation + side * Math.PI / 2
      m.setPosition(p.x + Math.cos(out) * 14, p.y + Math.sin(out) * 14).setRotation(p.rotation + side * 1.2).setVisible(true)
      m.speed = MISSILE.speed
      m.age = m.puff = 0
      m.target = e
      u.live.push(m)
    }
  }

  // One missile step; false = spent (hit something, burned out or left the arena).
  function fly(scene, m, dt) {
    const M = MISSILE, { w, h } = CONFIG.arena
    if ((m.age += dt) > M.life) { FX.explode(scene, m.x, m.y, COLORS.warning, 0.3); return false }
    let t = m.target
    if (!t || !t.active || t.telegraph > 0) t = m.target = nearest(scene, m.x, m.y, Infinity) // its target died first
    if (t) {
      const turn = M.turn * (1 + 3 * m.age) * dt
      m.rotation += Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(Math.atan2(t.y - m.y, t.x - m.x) - m.rotation), -turn, turn)
    }
    m.speed = Math.min(M.maxSpeed, m.speed + M.accel * dt)
    const cos = Math.cos(m.rotation), sin = Math.sin(m.rotation)
    m.x += cos * m.speed * dt
    m.y += sin * m.speed * dt
    if ((m.puff -= dt) <= 0) { m.puff = M.puff * (CONFIG.low ? 3 : 1); FX.trail(scene, m.x - cos * 10, m.y - sin * 10, m.rotation) }
    const list = scene.enemies
    for (let i = 0; i < list.length; i++) {
      const e = list[i], r = e.radius + M.radius
      if (e.telegraph > 0 || (e.x - m.x) ** 2 + (e.y - m.y) ** 2 > r * r) continue
      FX.explode(scene, m.x, m.y, COLORS.warning, 0.45)
      scene.hitEnemy(e, null, M.damage)
      return false
    }
    return m.x > -50 && m.x < w + 50 && m.y > -50 && m.y < h + 50
  }

  return {
    POOL,
    count,
    desc: (u, n) => descs(u)[Math.min(n, descs(u).length - 1)],
    label: (scene, x, y, kind, arg) => uiLabel(scene, x, y, ...LABEL[kind](arg)),

    makeTextures(scene) {
      const frame = [[-17, -25], [17, -25], [25, -17], [25, 17], [17, 25], [-17, 25], [-25, 17], [-25, -17]]
      for (const u of POOL) {
        canvasTex(scene, 'up_' + u.id, 80, 80, c => {
          c.beginPath(); poly(c, frame); neon(c, u.color, 2.4, 0.2)
          c.beginPath(); u.glyph(c); neon(c, 0xffffff, 1.7, 0)
        })
      }
      canvasTex(scene, 'upDrone', 44, 44, c => { c.beginPath(); poly(c, [[10, 0], [-6, -8], [-2, 0], [-6, 8]]); neon(c, COLORS.player, 1.8, 0.35) })
      canvasTex(scene, 'upMissile', 48, 32, c => {
        c.beginPath(); poly(c, [[11, 0], [5, -3], [-7, -3], [-10, -6], [-10, 6], [-7, 3], [5, 3]]); neon(c, COLORS.warning, 1.6, 0.4)
      })
      canvasTex(scene, 'upPip', 32, 32, c => { c.beginPath(); poly(c, [[0, -6], [6, 0], [0, 6], [-6, 0]]); neon(c, 0xffffff, 1.4, 1) })
      const pre = (kind, arg) => Upgrades.label(scene, 0, 0, kind, arg).destroy()
      pre('title')
      pre('hint')
      for (const u of POOL) { pre('name', u); descs(u).forEach(d => pre('desc', d)) }
    },

    init(scene) {
      scene.mods = { fireRate: 1, speed: 1, pierce: 0, ricochet: 0, damage: 1, bulletSpeed: 1, dashCooldown: 1, magnet: 1, duration: 1 }
      scene.upgrades = []
      // this run's drones and missiles (a restart destroys the old ones with the scene)
      const u = scene._up = { drones: [], live: [], pool: [], missiles: 0, missileT: 0, side: 1, orbit: 0, aegis: false }
      const onSector = () => {
        if (!u.aegis || scene.shield) return
        scene.shield = true
        if (scene.player.visible) FX.collect(scene, scene.player.x, scene.player.y, COLORS.shield)
        SFX.play('powerup')
      }
      const onDied = () => hide(u) // also covers game over, after which update() stops running
      scene.events.on('sector', onSector)
      scene.events.on('died', onDied)
      scene.events.once('shutdown', () => { scene.events.off('sector', onSector); scene.events.off('died', onDied) })
    },

    update(scene, dt) {
      const u = scene._up
      if (scene.beat > 0 || !scene.player.visible) return hide(u)
      u.orbit += DRONE.spin * dt
      for (let i = 0; i < u.drones.length; i++) droneStep(scene, u.drones[i], u.orbit + i * TAU / u.drones.length, dt)
      if (u.missiles && (u.missileT -= dt) <= 0) launch(scene, u)
      const list = u.live
      let n = 0 // compact in place: live missiles move to the front
      for (let i = 0; i < list.length; i++) {
        const m = list[i]
        if (fly(scene, m, dt)) list[n++] = m
        else { m.setVisible(false); u.pool.push(m) }
      }
      list.length = n
    },

    // GameScene is already paused in state 'choosing'; done(id) resumes it.
    offer(scene, done) {
      const choices = roll(scene)
      if (choices.length) scene.scene.launch('upgrade', { choices, done })
      else done(null)
    },

    apply(scene, id) {
      POOL.find(u => u.id === id).apply(scene)
      scene.upgrades.push(id)
      scene.events.emit('upgrade', id)
    },
  }
})()

// The pick: three cards over the paused arena. Click, 1/2/3, arrows or A/D + Enter/Space, or the pad (left/right + A).
class UpgradeScene extends Phaser.Scene {
  constructor() { super('upgrade') }

  create({ choices, done }) {
    const { w, h } = CONFIG.arena, g = this.scene.get('game'), n = choices.length
    const CW = 340, CH = 420, GAP = 380, R = 18, ADD = Phaser.BlendModes.ADD
    const rect = (gfx, fill) => fill ? gfx.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, R) : gfx.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, R)
    this.done = done
    this.sel = n >> 1                 // keyboard / pad focus starts in the middle
    this.ready = this.picked = false  // no picks at first: a held fire button or a panic click must not choose
    this.time.delayedCall(500, () => { this.ready = true })

    const dim = this.add.rectangle(w / 2, h / 2, w, h, COLORS.bg, 0.8)
    this.tweens.add({ targets: dim, alpha: { from: 0, to: 1 }, duration: 250 })
    const title = Upgrades.label(this, w / 2, 150, 'title')
    this.tweens.add({ targets: title, alpha: { from: 0, to: 1 }, duration: 600, ease: uiFlickerEase })
    Upgrades.label(this, w / 2, 810, 'hint')

    this.cards = choices.map((u, i) => {
      const x = w / 2 + (i - (n - 1) / 2) * GAP, y = 480, have = Upgrades.count(g, u.id)
      const glow = this.add.image(0, 0, 'glow').setDisplaySize(CW * 1.8, CH * 1.5).setTint(u.color).setBlendMode(ADD).setAlpha(0)
      const box = rect(this.add.graphics().fillStyle(0x060a16, 0.94), true)
      box.fillStyle(u.color, 0.08).fillRoundedRect(-CW / 2, -CH / 2, CW, 170, { tl: R, tr: R, bl: 0, br: 0 })
      for (const [lw, a] of [[12, 0.06], [6, 0.14], [2.5, 0.8]]) rect(box.lineStyle(lw, u.color, a))
      const hi = rect(rect(this.add.graphics().lineStyle(8, u.color, 0.3)).lineStyle(3, 0xffffff, 0.95)).setAlpha(0) // focus frame
      const parts = [glow, box, hi,
        this.add.image(0, -100, 'glow').setScale(1.6).setTint(u.color).setBlendMode(ADD).setAlpha(0.35),
        this.add.image(0, -100, 'up_' + u.id).setScale(1.5),
        Upgrades.label(this, 0, 8, 'name', u),
        Upgrades.label(this, 0, 72, 'desc', Upgrades.desc(u, have)),
        uiNum(this, -CW / 2 + 26, -CH / 2 + 28, 'numW', 22, 0.5).setText(String(i + 1)).setAlpha(0.5)]
      // stack pips: owned, this one (blinking), still to come
      for (let k = 0; k < u.max && u.max < Infinity; k++) {
        const pip = this.add.image((k - (u.max - 1) / 2) * 30, 160, 'upPip')
        if (k !== have) pip.setTint(u.color).setAlpha(k < have ? 1 : 0.22)
        else this.tweens.add({ targets: pip, alpha: 0.3, duration: 420, yoyo: true, repeat: -1 })
        parts.push(pip)
      }
      const flash = rect(this.add.graphics().fillStyle(0xffffff, 1), true).setBlendMode(ADD).setAlpha(0)
      const c = this.add.container(x, y + 300, [...parts, flash]).setAlpha(0)
      Object.assign(c, { u, hi, glow, flash })
      this.tweens.add({ targets: c, y, alpha: 1, duration: 380, delay: 60 * i, ease: 'Back.Out' }) // done before input opens
      this.add.zone(x, y, CW, CH).setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.focus(i))
        .on('pointerdown', ptr => { if (ptr.button === 0) this.pick(i) })
      return c
    })

    this.input.keyboard.on('keydown', e => {
      if (e.repeat) return
      const k = e.code, d = /^(Digit|Numpad)[1-9]$/.test(k) ? +k.slice(-1) : 0
      if (d) this.pick(d - 1)
      else if (k === 'ArrowLeft' || k === 'KeyA') this.focus(this.sel - 1)
      else if (k === 'ArrowRight' || k === 'KeyD') this.focus(this.sel + 1)
      else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') this.pick(this.sel)
    })
  }

  update(time, delta) {
    if (Pad.hit('left')) this.focus(this.sel - 1)
    if (Pad.hit('right')) this.focus(this.sel + 1)
    if (Pad.hit('a')) this.pick(this.sel)
    const k = Math.min(1, delta / 70), pulse = 0.28 + 0.1 * Math.sin(time / 150)
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i], on = i === this.sel
      c.hi.alpha += (+on - c.hi.alpha) * k
      c.glow.alpha = c.hi.alpha * pulse
      if (!this.picked) c.setScale(c.scale + ((on ? 1.06 : 1) - c.scale) * k)
    }
  }

  focus(i) {
    i = (i + this.cards.length) % this.cards.length
    if (this.picked || i === this.sel) return
    this.sel = i
    SFX.play('uiMove')
  }

  pick(i) {
    const c = this.cards[i]
    if (!c || !this.ready || this.picked) return
    this.picked = true
    this.sel = i
    Upgrades.apply(this.scene.get('game'), c.u.id)
    SFX.play('upgrade')
    this.tweens.add({ targets: c.flash, alpha: { from: 0.95, to: 0 }, duration: 420, ease: 'Cubic.Out' })
    this.tweens.add({ targets: c, scale: { from: 1.2, to: 1.08 }, duration: 420, ease: 'Back.Out' })
    const ring = this.add.image(c.x, c.y, 'ring').setTint(c.u.color).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: ring, scale: { from: 1.5, to: 8 }, alpha: { from: 1, to: 0 }, duration: 560, ease: 'Cubic.Out' })
    for (const o of this.cards) {
      if (o === c) continue
      this.tweens.killTweensOf(o)
      this.tweens.add({ targets: o, alpha: 0, y: o.y + 60, duration: 260, ease: 'Cubic.In' })
    }
    this.tweens.add({ targets: this.cameras.main, alpha: 0, delay: 460, duration: 200 })
    this.time.delayedCall(680, () => { this.scene.stop(); this.done(c.u.id) })
  }
}
