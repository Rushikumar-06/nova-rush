// NOVA RUSH - deep-space backdrop: a nebula and a planet / sun / black hole per sector, drifting parallax
// star layers, and the warp jump between sectors. Painted once at boot; per frame it is a handful of quads.

const Space = (() => {
  const { w: W, h: H } = CONFIG.arena
  const M = 70 // layers overhang the arena by this much, so parallax never reveals an edge
  const TAU = Math.PI * 2
  const rnd = Phaser.Math.FloatBetween
  const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 // roughly normal, -1..1

  // One theme per sector (they repeat after the fifth). Features sit low / at the sides, away from the HUD.
  const THEMES = [
    { name: 'ORION DRIFT', base: [0x03050e, 0x0a1026], neb: [0x2448ff, 0x7a2cff, 0x19a3ff], bend: 0.25, dust: 1,
      feature: { kind: 'planet', type: 'ice', x: 1460, y: 760, r: 180, colors: [0xd8f2ff, 0x5b9bd6, 0x0d2350], atmo: 0x8fdcff } },
    { name: 'CRIMSON EXPANSE', base: [0x0c0306, 0x1e0709], neb: [0xff3b2f, 0xff8a1f, 0x9b1fff], bend: -0.3, dust: 1.2,
      feature: { kind: 'planet', type: 'rock', x: 210, y: 720, r: 150, colors: [0xf0955e, 0xa3402a, 0x2a0a06], atmo: 0xffa47a } },
    { name: 'EMERALD VEIL', base: [0x020a09, 0x061a1c], neb: [0x12c98a, 0x1f7aff, 0x6dff5a], bend: 0.35, dust: 1,
      feature: { kind: 'planet', type: 'gas', x: 1330, y: 660, r: 150, tilt: -0.35, ring: true, colors: [0xf2dcae, 0xb08352, 0x3a2412], atmo: 0xfff0c8 } },
    { name: 'SOLAR FURNACE', base: [0x0e0603, 0x220e04], neb: [0xffb02e, 0xff4f1f, 0xffe27a], bend: -0.2, dust: 0.8,
      feature: { kind: 'sun', x: 1480, y: 810, r: 100, colors: [0xfff6d8, 0xffc24a, 0xff6a1f] } },
    { name: 'THE VOID', base: [0x040109, 0x0c0418], neb: [0x6a1fff, 0xff2d9a, 0x2140ff], bend: 0.3, dust: 1.4,
      feature: { kind: 'hole', x: 330, y: 640, r: 55, colors: [0xfff1d0, 0xff9a3a, 0xa03cff] } },
  ]
  const themeIndex = sector => (sector - 1) % THEMES.length

  function blob(c, x, y, r, color, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.5)); g.addColorStop(1, rgba(color, 0))
    c.fillStyle = g
    c.fillRect(x - r, y - r, r * 2, r * 2)
  }

  function paintStars(c, w, h, n, r0, r1, bright) {
    const tints = [0xffffff, 0xcfe0ff, 0xfff1d6, 0xdbe6ff]
    for (let i = 0; i < n; i++) {
      c.fillStyle = rgba(tints[i % 4], rnd(0.25, 0.95))
      c.beginPath(); c.arc(rnd(0, w), rnd(0, h), rnd(r0, r1), 0, TAU); c.fill()
    }
    for (let i = 0; i < bright; i++) { // a few bright stars with a halo and diffraction spikes, off the tile seams
      const x = rnd(30, w - 30), y = rnd(30, h - 30), len = rnd(8, 18), col = tints[i % 4]
      blob(c, x, y, len * 0.7, col, 0.35)
      c.strokeStyle = rgba(col, 0.55); c.lineWidth = 0.8
      c.beginPath(); c.moveTo(x - len, y); c.lineTo(x + len, y); c.moveTo(x, y - len); c.lineTo(x, y + len); c.stroke()
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill()
    }
  }

  // Half resolution (it is all soft light), shown at 2x: a glowing cloud band carved by dark dust lanes.
  function paintNebula(scene, key, t) {
    const w = Math.ceil((W + 2 * M) / 2), h = Math.ceil((H + 2 * M) / 2)
    const c = scene.textures.createCanvas(key, w, h).context
    const g = c.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, rgba(t.base[0], 1)); g.addColorStop(1, rgba(t.base[1], 1))
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) blob(c, rnd(0, w), rnd(0, h), rnd(250, 380), t.neb[i], 0.07) // ambient wash
    const x0 = rnd(-0.1, 0.35) * w, y0 = rnd(0.1, 0.9) * h, x1 = rnd(0.65, 1.1) * w, y1 = rnd(0.1, 0.9) * h
    const along = (k, spread) => [x0 + (x1 - x0) * k + gauss() * w * spread, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * t.bend * h + gauss() * h * spread * 1.8]
    for (let i = 0; i < 90; i++) blob(c, ...along(Math.random(), 0.1), rnd(25, 140), t.neb[i % 3], rnd(0.03, 0.1))
    c.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 40; i++) blob(c, ...along(Math.random(), 0.05), rnd(15, 60), 0x000000, rnd(0.15, 0.4) * t.dust)
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 14; i++) blob(c, ...along(Math.random(), 0.07), rnd(5, 16), 0xffffff, rnd(0.05, 0.15)) // hot knots
    c.globalCompositeOperation = 'source-over'
    if (CONFIG.low) paintStars(c, w, h, 450, 0.3, 0.8, 0) // low mode has no star layers: bake a few in
    scene.textures.get(key).refresh()
  }

  const SURFACE = {
    rock(c, f) { // craters and dark lowlands
      for (let i = 0; i < 38; i++) {
        const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * f.r, x = Math.cos(a) * d, y = Math.sin(a) * d, s = rnd(0.04, 0.2) * f.r
        blob(c, x, y, s, i % 3 ? f.colors[2] : f.colors[0], rnd(0.2, 0.45))
        if (i % 4 === 0) { c.strokeStyle = rgba(f.colors[0], 0.35); c.lineWidth = 1; c.beginPath(); c.arc(x, y, s * 0.6, 0, TAU); c.stroke() }
      }
    },
    ice(c, f) { // pale streaks and a polar cap
      const r = f.r
      for (let i = 0; i < 26; i++) { c.fillStyle = rgba(i % 2 ? 0xffffff : f.colors[1], rnd(0.05, 0.18)); c.fillRect(-r, rnd(-r, r), 2 * r, rnd(2, 10)) }
      blob(c, 0, -r * 0.95, r * 0.55, 0xffffff, 0.85)
      for (let i = 0; i < 12; i++) blob(c, rnd(-0.8, 0.8) * r, rnd(-0.8, 0.8) * r, rnd(0.05, 0.14) * r, 0xffffff, 0.2)
    },
    gas(c, f) { // tilted cloud bands and a storm
      const r = f.r
      c.save(); c.rotate(f.tilt)
      for (let i = 0; i < 30; i++) {
        c.fillStyle = rgba([f.colors[0], f.colors[1], f.colors[2], 0xffffff][i % 4], rnd(0.08, 0.3))
        c.fillRect(-r * 1.2, -r + (i + rnd(-0.3, 0.3)) * (2 * r / 30), r * 2.4, rnd(2, 2 * r / 18))
      }
      c.fillStyle = rgba(0xc0502a, 0.55); c.beginPath(); c.ellipse(r * 0.25, r * 0.3, r * 0.2, r * 0.09, 0, 0, TAU); c.fill()
      c.restore()
    },
  }

  // Ring system: side -1 is the half behind the planet (drawn first), +1 the half in front.
  function rings(c, f, side) {
    const r = f.r
    c.save(); c.rotate(f.tilt)
    c.beginPath(); c.rect(-r * 3, side < 0 ? -r * 3 : 0, r * 6, r * 3); c.clip()
    for (let k = 0; k < 9; k++) {
      const s = 1.35 + k * 0.08
      c.strokeStyle = rgba(k % 3 ? f.colors[0] : f.colors[1], k === 4 ? 0.1 : rnd(0.25, 0.55))
      c.lineWidth = r * 0.06
      c.beginPath(); c.ellipse(0, 0, r * s, r * s * 0.24, 0, 0, TAU); c.stroke()
    }
    c.restore()
  }

  // Lit sphere: surface detail, a night side away from the light (top-left) and a glowing atmosphere.
  function paintPlanet(c, f) {
    const r = f.r, [c0, c1, c2] = f.colors
    const halo = c.createRadialGradient(0, 0, r * 0.95, 0, 0, r * 1.35)
    halo.addColorStop(0, rgba(f.atmo, 0.35)); halo.addColorStop(1, rgba(f.atmo, 0))
    c.fillStyle = halo; c.beginPath(); c.arc(0, 0, r * 1.35, 0, TAU); c.fill()
    if (f.ring) rings(c, f, -1)
    c.save()
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip()
    const base = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.2)
    base.addColorStop(0, rgba(c0, 1)); base.addColorStop(0.55, rgba(c1, 1)); base.addColorStop(1, rgba(c2, 1))
    c.fillStyle = base; c.fillRect(-r, -r, 2 * r, 2 * r)
    SURFACE[f.type](c, f)
    const shade = c.createRadialGradient(-r * 0.5, -r * 0.5, r * 0.2, -r * 0.2, -r * 0.2, r * 1.9)
    for (const [o, a] of [[0, 0], [0.5, 0.15], [0.78, 0.75], [1, 0.95]]) shade.addColorStop(o, `rgba(0,0,0,${a})`)
    c.fillStyle = shade; c.fillRect(-r, -r, 2 * r, 2 * r)
    c.restore()
    c.save()
    c.shadowColor = rgba(f.atmo, 1); c.shadowBlur = 14; c.strokeStyle = rgba(f.atmo, 0.75); c.lineWidth = 2.2
    c.beginPath(); c.arc(0, 0, r - 1, Math.PI * 0.75, Math.PI * 1.75); c.stroke() // lit limb
    c.restore()
    if (f.ring) rings(c, f, 1)
  }

  function paintSun(c, f) {
    const r = f.r, [c0, c1, c2] = f.colors
    const g = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 4.2)
    g.addColorStop(0, rgba(c1, 0.9)); g.addColorStop(0.25, rgba(c2, 0.35)); g.addColorStop(1, rgba(c2, 0))
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 4.2, 0, TAU); c.fill()
    c.globalCompositeOperation = 'lighter'
    const ray = c.createRadialGradient(0, 0, r, 0, 0, r * 3.6) // corona rays fade out along their length
    ray.addColorStop(0, rgba(c1, 0.14)); ray.addColorStop(1, rgba(c1, 0))
    c.fillStyle = ray
    for (let i = 0; i < 28; i++) {
      const a = rnd(0, TAU), wdt = rnd(0.02, 0.07)
      c.globalAlpha = rnd(0.4, 1)
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * rnd(1.6, 3.6), a - wdt, a + wdt); c.closePath(); c.fill()
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    const d = c.createRadialGradient(0, 0, 0, 0, 0, r) // limb-darkened disc
    d.addColorStop(0, '#ffffff'); d.addColorStop(0.6, rgba(c0, 1)); d.addColorStop(1, rgba(c1, 1))
    c.fillStyle = d; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
  }

  // Black hole: tilted accretion disk, the far side of it lensed over the top, a photon ring.
  function paintHole(c, f) {
    const r = f.r, [c0, c1, c2] = f.colors
    const g = c.createRadialGradient(0, 0, r, 0, 0, r * 4)
    g.addColorStop(0, rgba(c2, 0.35)); g.addColorStop(1, rgba(c2, 0))
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 4, 0, TAU); c.fill()
    const disk = side => {
      c.save(); c.rotate(-0.28)
      c.beginPath(); c.rect(-r * 5, side < 0 ? -r * 5 : 0, r * 10, r * 5); c.clip()
      c.globalCompositeOperation = 'lighter'
      for (let k = 0; k < 14; k++) {
        const s = 1.35 + k * 0.14, t = k / 13
        c.strokeStyle = rgba(t < 0.3 ? c0 : t < 0.7 ? c1 : c2, (1 - t) * 0.5 + 0.08)
        c.lineWidth = r * 0.16
        c.beginPath(); c.ellipse(0, 0, r * s, r * s * 0.27, 0, 0, TAU); c.stroke()
      }
      c.restore()
    }
    disk(-1)
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(c0, 0.55); c.lineWidth = r * 0.12
    c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 1.15, 0, Math.PI, TAU); c.stroke(); c.restore()
    c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
    disk(1)
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5
    c.beginPath(); c.arc(0, 0, r * 1.03, 0, TAU); c.stroke()
  }

  function paintFeature(scene, key, f) {
    const half = Math.ceil(f.r * { planet: f.ring ? 2.25 : 1.4, sun: 4.2, hole: 4 }[f.kind]) + 4
    const tex = scene.textures.createCanvas(key, half * 2, half * 2)
    tex.context.translate(half, half)
    ;({ planet: paintPlanet, sun: paintSun, hole: paintHole })[f.kind](tex.context, f)
    tex.refresh()
  }

  function scenery(scene, s, sector) {
    const k = themeIndex(sector), f = THEMES[k].feature
    s.neb = scene.add.image(W / 2, H / 2, 'neb' + k).setScale(2).setDepth(-10)
    s.feat = scene.add.image(f.x, f.y, 'feat' + k).setDepth(-8)
    s.home = [f.x, f.y]
  }

  return {
    name: sector => THEMES[themeIndex(sector)].name,

    makeTextures(scene) {
      if (!CONFIG.low) {
        for (const [key, n, r0, r1, bright] of [['starsFar', 900, 0.4, 1.1, 0], ['starsNear', 110, 0.8, 1.7, 7]]) {
          const tex = scene.textures.createCanvas(key, 1024, 1024) // power of two: the tile sprites repeat it natively
          paintStars(tex.context, 1024, 1024, n, r0, r1, bright)
          tex.refresh()
        }
      }
      THEMES.forEach((t, i) => { paintNebula(scene, 'neb' + i, t); paintFeature(scene, 'feat' + i, t.feature) })
    },

    create(scene, sector = 1) {
      const s = scene._space = { px: 0, py: 0, boost: 0, slide: 0, twinkle: [] }
      scenery(scene, s, sector)
      if (!CONFIG.low) {
        s.far = scene.add.tileSprite(W / 2, H / 2, W + 2 * M, H + 2 * M, 'starsFar').setDepth(-9)
        s.near = scene.add.tileSprite(W / 2, H / 2, W + 2 * M, H + 2 * M, 'starsNear').setDepth(-7)
        for (let i = 0; i < 18; i++) {
          const d = scene.add.image(rnd(0, W), rnd(0, H), 'dot').setDepth(-7).setScale(rnd(0.3, 0.7)).setBlendMode(Phaser.BlendModes.ADD)
          d.home = [d.x, d.y]
          scene.tweens.add({ targets: d, alpha: { from: 0.1, to: 1 }, scale: d.scale * 1.6, duration: rnd(700, 2200), yoyo: true, repeat: -1, delay: rnd(0, 2000), ease: 'Sine.InOut' })
          s.twinkle.push(d)
        }
      }
      // warp streaks fly out from the middle of the view
      s.streaks = scene.add.particles(W / 2, H / 2, 'spark', {
        emitting: false, frequency: 12, quantity: CONFIG.low ? 2 : 6, blendMode: 'ADD',
        lifespan: 600,
        emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 180) },
        rotate: { onEmit: () => rnd(0, 360) },
        angle: { onEmit: p => p.angle },
        speed: { min: 900, max: 2000 },
        scaleX: { start: 0.5, end: 6 }, scaleY: { start: 0.5, end: 1.1 },
        alpha: { start: 0.2, end: 1 },
        tint: [0xffffff, 0xcfe6ff, 0x9fc0ff],
      }).setDepth(-6)
    },

    // Layers slide against the focus point (the ship; the pointer on the title), deeper layers less: depth.
    update(scene, dt, fx, fy) {
      const s = scene._space, k = Math.min(1, dt * 2.5)
      s.px += ((W / 2 - fx) / (W / 2) - s.px) * k
      s.py += ((H / 2 - fy) / (H / 2) - s.py) * k
      const ox = s.px * M, oy = s.py * M
      s.neb.setPosition(W / 2 + ox * 0.3, H / 2 + oy * 0.3)
      s.feat.setPosition(s.home[0] + ox * 0.55 + s.slide, s.home[1] + oy * 0.55)
      if (!s.far) return
      const v = (1 + s.boost) * dt
      s.far.setPosition(W / 2 + ox * 0.2, H / 2 + oy * 0.2)
      s.far.tilePositionX += 5 * v; s.far.tilePositionY -= 2 * v
      s.near.setPosition(W / 2 + ox * 0.95, H / 2 + oy * 0.95)
      s.near.tilePositionX += 16 * v; s.near.tilePositionY -= 6 * v
      for (const d of s.twinkle) d.setPosition(d.home[0] + ox * 0.95, d.home[1] + oy * 0.95)
    },

    // The jump: stars accelerate into streaks, a white flash hides the scenery swap, the new feature slides in.
    warp(scene, sector) {
      const s = scene._space, T = CONFIG.sector.warp * 1000
      scene.tweens.addCounter({ from: 0, to: 60, duration: T * 0.4, ease: 'Cubic.In', onUpdate: tw => { s.boost = tw.getValue() } })
      s.streaks.start()
      scene.time.delayedCall(T * 0.4, () => {
        FX.flash(scene, 0xffffff, 500)
        const old = [s.neb, s.feat]
        scenery(scene, s, sector)
        s.neb.setAlpha(0); s.feat.setAlpha(0)
        s.slide = s.home[0] < W / 2 ? -500 : 500
        scene.tweens.add({ targets: [s.neb, s.feat], alpha: 1, duration: 500 })
        scene.tweens.add({ targets: s, slide: 0, duration: T * 0.6, ease: 'Cubic.Out' })
        scene.tweens.add({ targets: old, alpha: 0, duration: 500, onComplete: () => old.forEach(o => o.destroy()) })
      })
      scene.time.delayedCall(T * 0.55, () => {
        s.streaks.stop()
        scene.tweens.addCounter({ from: s.boost, to: 0, duration: T * 0.45, ease: 'Cubic.Out', onUpdate: tw => { s.boost = tw.getValue() } })
      })
    },
  }
})()
