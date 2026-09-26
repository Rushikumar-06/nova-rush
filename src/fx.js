// NOVA RUSH - visual identity: ship + enemy textures, particles, camera juice.
// Everything init() creates belongs to the scene, so a restart rebuilds it cleanly.

// IIFE keeps helpers out of the global scope that all classic scripts share.
const FX = (() => {
  const { w: W, h: H } = CONFIG.arena
  const PAD = 14 // room around a shape for its baked glow
  const TAU = Math.PI * 2
  const rnd = Phaser.Math.FloatBetween
  const deg = Phaser.Math.RadToDeg
  const hex = c => '#' + c.toString(16).padStart(6, '0')
  const mix = (a, b, t) => [16, 8, 0].reduce((c, s) => c | Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s, 0)
  const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r]
  const star = (n, r1, r2, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => polar(i % 2 ? r2 : r1, rot + i * Math.PI / n))
  const square = (x, y, h) => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]
  const ngon = (n, r, rot = 0) => Array.from({ length: n }, (_, i) => polar(r, rot + i * TAU / n))
  const poly = (ctx, pts) => { ctx.moveTo(...pts[0]); pts.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath() }

  // Per-burst settings read by the emitters' onEmit callbacks (set right before each emit).
  let burst = { a0: 0, a1: 360, speed: 500 }
  let nextPop = null
  let trailDir = 0
  let cursor = 'crosshair'

  // Canvas texture with the origin at its center.
  function canvasTex(scene, key, w, h, draw) {
    const tex = scene.textures.createCanvas(key, w, h)
    const ctx = tex.context
    ctx.translate(w / 2, h / 2)
    ctx.lineJoin = ctx.lineCap = 'round'
    draw(ctx)
    tex.refresh()
    return tex
  }

  // Neon stroke of the current path, added up: faint wide halos -> blurred color line -> pale hot core.
  function neon(ctx, color, lw, fill = 0.14) {
    const css = hex(color)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = css
    if (fill) { ctx.globalAlpha = fill; ctx.fill() }
    for (const [w, a, blur] of [[lw * 5, 0.08, 0], [lw * 3, 0.16, 0], [lw * 1.5, 1, 10]]) {
      ctx.lineWidth = w; ctx.globalAlpha = a; ctx.shadowBlur = blur; ctx.stroke()
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
    ctx.strokeStyle = hex(mix(color, 0xffffff, 0.65)); ctx.lineWidth = lw * 0.6; ctx.stroke()
  }

  // Centered glowing shape whose body radius is r.
  function body(scene, key, r, color, lw, path) {
    const s = 2 * Math.ceil(r + PAD)
    canvasTex(scene, key, s, s, ctx => { ctx.beginPath(); path(ctx, r); neon(ctx, color, lw) })
  }

  // White radial blob, meant to be tinted.
  function soft(scene, key, size, stops) {
    canvasTex(scene, key, size, size, ctx => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2)
      stops.forEach(([o, a]) => g.addColorStop(o, `rgba(255,255,255,${a})`))
      ctx.fillStyle = g
      ctx.fillRect(-size / 2, -size / 2, size, size)
    })
  }

  const line = (c, x0, y0, x1, y1, color, lw) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = color; c.lineWidth = lw; c.stroke() }
  const glowDot = (c, x, y, color, r) => { c.save(); c.shadowColor = c.fillStyle = color; c.shadowBlur = 6; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore() }
  const linGrad = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g }

  // Top-down fighter in display pixels, nose toward +x (~60 long, ~49 wide). Light falls from the -y side.
  function drawShip(c) {
    const edge = '#0b121b', stripe = hex(COLORS.player)
    const hull = () => {
      c.beginPath()
      c.moveTo(31, 0)
      c.quadraticCurveTo(26, -5.4, 14, -6)
      c.lineTo(-18, -6)
      c.quadraticCurveTo(-24, -6, -25, -3)
      c.lineTo(-25, 3)
      c.quadraticCurveTo(-24, 6, -18, 6)
      c.lineTo(14, 6)
      c.quadraticCurveTo(26, 5.4, 31, 0)
      c.closePath()
    }
    const wing = s => { c.beginPath(); poly(c, [[10, 4 * s], [-9, 23 * s], [-17, 24.5 * s], [-19.5, 21 * s], [-14, 5.5 * s]]) }
    const nacelle = s => { c.beginPath(); c.roundRect(-27, 7 * s - 3.4, 18, 6.8, 2.6) }

    // faint cyan rim so the ship reads on any backdrop (only its blur shows past the opaque hull)
    c.save()
    c.shadowColor = stripe; c.shadowBlur = 10; c.fillStyle = 'rgba(0,229,255,0.35)'
    for (const s of [-1, 1]) { wing(s); c.fill(); nacelle(s); c.fill() }
    hull(); c.fill()
    c.restore()

    for (const s of [-1, 1]) {
      wing(s)
      c.fillStyle = linGrad(c, 0, 4 * s, 0, 24 * s, [[0, '#a7b6c6'], [1, '#4d5c6d']]); c.fill()
      c.lineWidth = 1; c.strokeStyle = edge; c.stroke()
      line(c, 8, 6.2 * s, -8.5, 21 * s, stripe, 1.6)                     // leading-edge stripe
      line(c, -3, 9 * s, -14, 19.5 * s, 'rgba(12,20,30,0.55)', 0.7)       // panel line
      line(c, -14.5, 7 * s, -18.5, 20.5 * s, 'rgba(12,20,30,0.55)', 0.7)  // flap
      c.fillStyle = '#28313b'; c.fillRect(0, 9.5 * s - 1.1, 17, 2.2)     // wing cannon
      c.fillStyle = '#dfe7ef'; c.fillRect(16, 9.5 * s - 1.1, 2, 2.2)
      glowDot(c, -17.5, 23.2 * s, s < 0 ? '#ff4d4d' : '#4dff88', 1.5)   // nav lights: red port, green starboard
    }
    for (const s of [-1, 1]) {
      nacelle(s)
      c.fillStyle = linGrad(c, 0, 7 * s - 3.4, 0, 7 * s + 3.4, [[0, '#56687a'], [0.35, '#c3cfdb'], [1, '#2a3644']]); c.fill()
      c.lineWidth = 1; c.strokeStyle = edge; c.stroke()
      c.fillStyle = '#10151b'; c.fillRect(-28.5, 7 * s - 2.8, 2.6, 5.6)  // exhaust nozzle, hot inside
      glowDot(c, -27.2, 7 * s, '#ffb35a', 1.8)
    }
    hull()
    c.fillStyle = linGrad(c, 0, -6, 0, 6, [[0, '#3f5063'], [0.25, '#cfdae5'], [0.42, '#f4f8fb'], [0.7, '#99aabb'], [1, '#27333f']])
    c.fill(); c.lineWidth = 1; c.strokeStyle = edge; c.stroke()
    for (const x of [21, 1, -11]) line(c, x, -5.6, x, 5.6, 'rgba(12,20,30,0.35)', 0.6)
    line(c, 4, 0, -22, 0, 'rgba(12,20,30,0.4)', 0.6)
    for (const s of [-1, 1]) {
      line(c, -2, 3.2 * s, -16, 3.2 * s, stripe, 0.9)
      c.fillStyle = '#1b2530'; c.fillRect(-7, 3.8 * s - 0.9, 4.5, 1.8)  // intakes
    }
    // cockpit glass with a reflection
    c.beginPath(); c.ellipse(13, 0, 8, 3.5, 0, 0, TAU)
    const g = c.createRadialGradient(15.5, -1.4, 0.5, 13, 0, 8.5)
    g.addColorStop(0, '#c9f7ff'); g.addColorStop(0.3, '#35b3d9'); g.addColorStop(1, '#06202e')
    c.fillStyle = g; c.fill(); c.lineWidth = 0.9; c.strokeStyle = edge; c.stroke()
    c.beginPath(); c.ellipse(13.5, -0.8, 5.5, 1.7, 0, Math.PI * 1.05, Math.PI * 1.85)
    c.lineWidth = 0.8; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke()
    c.fillStyle = '#1b2530'; c.beginPath(); c.arc(29.6, 0, 1.1, 0, TAU); c.fill() // sensor tip
  }

  // One tinted particle that scales s0 -> s1 (ease-out) and fades a0 -> a1 over ms.
  function pop(em, x, y, color, s0, s1, a0, a1, ms) {
    nextPop = { s0, s1, a0, a1, ms }
    em.particleTint = color
    em.explode(1, x, y)
  }

  return {
    get cursor() { return cursor },  // CSS cursor: the OS draws the crosshair, so aiming has no frame lag

    makeTextures(scene) {
      const E = CONFIG.enemies
      canvasTex(scene, 'player', 172, 148, c => { c.scale(2, 2); drawShip(c) }) // 2x: stays crisp when rotated
      canvasTex(scene, 'lifeIcon', 34, 34, c => { c.rotate(-Math.PI / 2); c.scale(0.46, 0.46); drawShip(c) })

      // engine flame, origin at its right end (the nozzle); white-hot core -> orange -> faint blue tip
      const fl = scene.textures.createCanvas('flame', 96, 32), fc = fl.context
      fc.translate(96, 16); fc.scale(1, 0.34)
      const fg = fc.createRadialGradient(0, 0, 0, 0, 0, 96)
      for (const [o, col] of [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,248,210,0.95)'], [0.28, 'rgba(255,176,72,0.75)'],
        [0.55, 'rgba(255,86,36,0.32)'], [0.8, 'rgba(110,90,255,0.1)'], [1, 'rgba(0,0,0,0)']]) fg.addColorStop(o, col)
      fc.fillStyle = fg; fc.fillRect(-96, -48, 96, 96)
      fl.refresh()

      canvasTex(scene, 'bubble', 200, 200, c => { // shield / respawn bubble, tinted
        const g = c.createRadialGradient(0, 0, 40, 0, 0, 72)
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0.3)')
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 72, 0, TAU); c.fill()
        c.beginPath(); c.arc(0, 0, 72, 0, TAU); neon(c, 0xffffff, 2.5, 0)
      })

      body(scene, 'wanderer', E.wanderer.radius, COLORS.wanderer, 2.2, (c, r) => {
        for (let k = 0; k < 4; k++) poly(c, [[0, 0], polar(r * 1.1, k * TAU / 4), polar(r * 0.65, k * TAU / 4 + 1.15)])
      })
      body(scene, 'chaser', E.chaser.radius, COLORS.chaser, 2.2, (c, r) => {
        poly(c, star(2, r * 1.1, r * 0.8))
        poly(c, star(2, r * 0.45, r * 0.32))
      })
      body(scene, 'dodger', E.dodger.radius, COLORS.dodger, 2.2, (c, r) => {
        poly(c, square(0, 0, r * 0.82))
        poly(c, star(2, r * 0.82, r * 0.82, 0))
      })
      body(scene, 'splitter', E.splitter.radius, COLORS.splitter, 2.4, (c, r) => {
        poly(c, square(0, 0, r * 0.85))
        for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) poly(c, square(x * r * 0.38, y * r * 0.38, r * 0.22))
      })
      body(scene, 'spinner', E.spinner.radius, COLORS.spinner, 1.8, (c, r) => poly(c, star(3, r * 1.2, r * 0.4)))
      // new kinds face +x (their heading / aim): a notched dart, an armored hex fortress, a finned turret
      body(scene, 'darter', E.darter.radius, COLORS.darter, 2, (c, r) => {
        poly(c, [[r * 1.25, 0], [-r * 0.85, r * 0.75], [-r * 0.4, 0], [-r * 0.85, -r * 0.75]])
        c.moveTo(r * 0.55, 0); c.lineTo(-r * 0.05, 0)
      })
      body(scene, 'brute', E.brute.radius, COLORS.brute, 2.8, (c, r) => {
        poly(c, ngon(6, r))
        poly(c, ngon(6, r * 0.58, TAU / 12))
        for (let k = 0; k < 6; k++) { c.moveTo(...polar(r * 0.58, (k + 0.5) * TAU / 6)); c.lineTo(...polar(r * 0.87, (k + 0.5) * TAU / 6)) }
        c.moveTo(r * 0.2, 0); c.arc(0, 0, r * 0.2, 0, TAU)
      })
      body(scene, 'gunner', E.gunner.radius, COLORS.gunner, 2, (c, r) => {
        c.moveTo(r * 0.6, 0); c.arc(0, 0, r * 0.6, 0, TAU)
        poly(c, [[r * 0.45, -r * 0.17], [r * 1.2, -r * 0.17], [r * 1.2, r * 0.17], [r * 0.45, r * 0.17]])
        for (const s of [-1, 1]) poly(c, [[-r * 0.25, s * r * 0.55], [-r * 0.95, s * r * 0.95], [-r * 0.7, s * r * 0.2]])
      })

      // mothership: armored octagon with spikes, launch bays and a white-hot core
      const B = E.boss.radius
      canvasTex(scene, 'boss', 2 * Math.ceil(B * 1.35 + PAD), 2 * Math.ceil(B * 1.35 + PAD), c => {
        const oct = ngon(8, B, TAU / 16)
        c.beginPath(); poly(c, oct); c.fillStyle = 'rgba(40,10,4,0.85)'; c.fill()
        c.beginPath(); poly(c, oct)
        for (let i = 0; i < 8; i++) { const a = (i + 0.5) * TAU / 8; poly(c, [polar(B * 0.93, a - 0.13), polar(B * 1.3, a), polar(B * 0.93, a + 0.13)]) }
        neon(c, COLORS.boss, 3.2, 0.12)
        c.beginPath(); poly(c, ngon(6, B * 0.6))
        for (let i = 0; i < 4; i++) poly(c, square(...polar(B * 0.8, i * TAU / 4 + TAU / 8), B * 0.07))
        neon(c, mix(COLORS.boss, COLORS.accent, 0.4), 2.2, 0.1)
        const g = c.createRadialGradient(0, 0, 0, 0, 0, B * 0.34)
        g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#ffd08a'); g.addColorStop(1, 'rgba(255,106,45,0)')
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, B * 0.34, 0, TAU); c.fill()
      })

      // power-up capsules: colored hex + white glyph
      const glyphs = {
        rapid: c => { for (const dx of [-4, 3]) { c.moveTo(dx - 3, -5); c.lineTo(dx + 2, 0); c.lineTo(dx - 3, 5) } },
        spread: c => { for (const a of [-0.55, 0, 0.55]) { c.moveTo(0, 6); c.lineTo(Math.sin(a) * 9, 6 - Math.cos(a) * 11) } },
        shield: c => poly(c, [[0, -7], [6, -4.5], [5, 2], [0, 7], [-5, 2], [-6, -4.5]]),
        bomb: c => { c.arc(0, 1, 5, 0, TAU); c.moveTo(3, -3); c.lineTo(6, -7) },
      }
      for (const [type, glyph] of Object.entries(glyphs)) {
        canvasTex(scene, 'pu_' + type, 64, 64, c => {
          c.beginPath(); poly(c, ngon(6, 15, TAU / 12)); neon(c, COLORS[type === 'bomb' ? 'accent' : type], 2.2, 0.3)
          c.beginPath(); glyph(c); neon(c, 0xffffff, 1.4, 0)
        })
      }

      canvasTex(scene, 'bullet', 34, 18, c => { c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); neon(c, COLORS.bullet, 3, 0) })
      // enemy shot: a hot orb with a white core (round, so nothing like the player's yellow streaks)
      canvasTex(scene, 'ebullet', 40, 40, c => {
        const g = c.createRadialGradient(0, 0, 4, 0, 0, 20) // soft halo: reads in a crowd without a bigger hitbox
        g.addColorStop(0, hex(COLORS.ebullet) + '80'); g.addColorStop(1, hex(COLORS.ebullet) + '00')
        c.fillStyle = g; c.fillRect(-20, -20, 40, 40)
        c.beginPath(); c.arc(0, 0, 5, 0, TAU); neon(c, COLORS.ebullet, 2.6, 0.9)
        c.beginPath(); c.arc(0, 0, 3.2, 0, TAU); c.fillStyle = '#fff'; c.fill()
      })
      // darter aim line: shown with its origin at the left end, fading along the lunge path
      canvasTex(scene, 'dline', 128, 12, c => {
        c.beginPath(); c.moveTo(-64, 0); c.lineTo(64, 0); neon(c, COLORS.darter, 1.4, 0)
        c.globalCompositeOperation = 'destination-in'
        c.fillStyle = linGrad(c, -64, 0, 64, 0, [[0, '#fff'], [1, 'rgba(255,255,255,0.2)']])
        c.fillRect(-64, -6, 128, 12)
      })
      const ch = canvasTex(scene, 'crosshair', 52, 52, c => {
        c.beginPath()
        c.arc(0, 0, 9, 0, TAU)
        for (let k = 0; k < 4; k++) { c.moveTo(...polar(14, k * TAU / 4)); c.lineTo(...polar(20, k * TAU / 4)) }
        neon(c, COLORS.player, 1.6, 0)
        c.beginPath(); c.arc(0, 0, 1.8, 0, TAU); c.fillStyle = '#fff'; c.fill()
      })
      try { cursor = `url(${ch.getSourceImage().toDataURL()}) 26 26, crosshair` } catch (e) {}
      canvasTex(scene, 'bombIcon', 30, 30, c => {
        c.beginPath(); c.arc(0, 0, 8, 0, TAU); neon(c, COLORS.accent, 1.8, 0.15)
        c.beginPath(); c.arc(0, 0, 3, 0, TAU); neon(c, COLORS.accent, 1.2, 1)
      })

      soft(scene, 'dot', 16, [[0, 1], [0.35, 0.8], [1, 0]])
      soft(scene, 'glow', 128, [[0, 1], [0.12, 0.6], [0.35, 0.2], [1, 0]])
      canvasTex(scene, 'ring', 128, 128, c => { c.beginPath(); c.arc(0, 0, 50, 0, TAU); neon(c, 0xffffff, 2.5, 0) })
      canvasTex(scene, 'shock', 512, 512, c => { c.beginPath(); c.arc(0, 0, 236, 0, TAU); neon(c, 0xffffff, 3, 0) }) // bomb ring, stays thin when huge
      // spark streak: bright head at +x, fading tail (particles are rotated to their travel direction)
      canvasTex(scene, 'spark', 32, 8, c => {
        const g = c.createLinearGradient(-16, 0, 16, 0)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(1, '#fff')
        c.strokeStyle = g
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(13, 0)
        c.globalAlpha = 0.35; c.lineWidth = 6; c.stroke()
        c.globalAlpha = 1; c.lineWidth = 2.5; c.stroke()
      })
    },

    init(scene) {
      const f = scene._fx = {}

      // arena force field
      const b = scene.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD)
      for (const [w, a] of [[18, 0.05], [8, 0.12], [3, 0.45]]) b.lineStyle(w, COLORS.border, a).strokeRect(1.5, 1.5, W - 3, H - 3)
      b.lineStyle(1, 0xffffff, 0.5).strokeRect(1.5, 1.5, W - 3, H - 3)

      const emit = (tex, depth, cfg) => scene.add.particles(0, 0, tex, { emitting: false, blendMode: 'ADD', ...cfg }).setDepth(depth)
      const dragX = { onUpdate: p => -2.5 * p.velocityX }, dragY = { onUpdate: p => -2.5 * p.velocityY }
      f.spark = emit('spark', 25, {
        maxAliveParticles: 1400,
        lifespan: { min: 300, max: 800 },
        // rotate picks the direction once; the emission angle reuses it (particle.angle holds the rotate value).
        // Drag only shortens the velocity, so the streak never needs re-aiming.
        rotate: { onEmit: () => rnd(burst.a0, burst.a1) },
        angle: { onEmit: p => p.angle },
        speed: { onEmit: () => rnd(0.2, 1) * burst.speed },
        scaleX: { start: 1.3, end: 0.1 },
        scaleY: 1,
        alpha: { start: 1, end: 0 },
        accelerationX: dragX, accelerationY: dragY,
      })
      f.ember = emit('dot', 25, {
        maxAliveParticles: 300,
        lifespan: { min: 900, max: 1800 },
        speed: { min: 20, max: 140 },
        scale: { start: 1, end: 0.2 },
        alpha: { start: 1, end: 0 },
        accelerationX: dragX, accelerationY: dragY,
      })
      const popCfg = max => ({
        maxAliveParticles: max,
        speed: 0,
        lifespan: { onEmit: () => nextPop.ms },
        scale: { onEmit: p => (p.pop = nextPop).s0, onUpdate: (p, k, t) => p.pop.s0 + (p.pop.s1 - p.pop.s0) * t * (2 - t) },
        alpha: { onEmit: () => nextPop.a0, onUpdate: (p, k, t) => p.pop.a0 + (p.pop.a1 - p.pop.a0) * t },
      })
      f.glow = emit('glow', 25, popCfg(300))
      f.ring = emit('ring', 25, popCfg(200))
      f.shock = emit('shock', 25, popCfg(20))
      f.trail = emit('dot', 18, { // maneuvering-thruster puffs, under the ship
        maxAliveParticles: 200,
        lifespan: { min: 180, max: 320 },
        speed: { min: 40, max: 130 },
        angle: { onEmit: () => trailDir + rnd(-14, 14) },
        scale: { start: 0.9, end: 0.15 },
        alpha: { start: 0.7, end: 0 },
        color: [0xfff6d0, COLORS.accent, 0xff5a1a, 0x401000],
      })
    },

    explode(scene, x, y, color, scale = 1) {
      const f = scene._fx, q = CONFIG.low ? 0.35 : 1
      burst = { a0: 0, a1: 360, speed: 680 * Math.sqrt(scale) }
      f.spark.particleTint = color
      f.spark.explode(Math.round(CONFIG.fx.sparks * scale * q), x, y)
      f.ember.particleTint = color
      f.ember.explode(Math.round(CONFIG.fx.embers * scale * q), x, y)
      pop(f.glow, x, y, color, 0.3 * scale, 1.4 * scale, 0.75, 0, 380)
      pop(f.glow, x, y, 0xffffff, 0.15 * scale, 0.45 * scale, 0.9, 0, 160) // white-hot core
      pop(f.ring, x, y, color, 0.1 * scale, 0.8 * scale, 0.9, 0, 320)
    },

    // mothership death: one huge blast, then a ripple of secondary explosions
    bigExplosion(scene, x, y, color) {
      const f = scene._fx
      FX.explode(scene, x, y, color, 3.2)
      pop(f.shock, x, y, color, 0.05, 2.6, 1, 0, 900)
      pop(f.glow, x, y, 0xffffff, 1, 5, 0.8, 0, 600)
      for (let i = 1; i <= 5; i++) {
        scene.time.delayedCall(i * 110, () => FX.explode(scene, x + rnd(-70, 70), y + rnd(-70, 70), i % 2 ? color : COLORS.accent, 1.6))
      }
    },

    sparks(scene, x, y, color) {
      const f = scene._fx, a = deg(Math.atan2(H / 2 - y, W / 2 - x)) // spray back into the arena
      burst = { a0: a - 75, a1: a + 75, speed: 320 }
      f.spark.particleTint = color
      f.spark.explode(5, x, y)
      pop(f.glow, x, y, color, 0.05, 0.22, 0.7, 0, 140)
    },

    // small hit spark on armor (mothership), sprayed back toward the shooter
    ping(scene, x, y, angle) {
      const f = scene._fx, a = deg(angle + Math.PI)
      burst = { a0: a - 50, a1: a + 50, speed: 380 }
      f.spark.particleTint = COLORS.accent
      f.spark.explode(3, x, y)
    },

    muzzle(scene, x, y, color = COLORS.bullet, size = 0.2) {
      pop(scene._fx.glow, x, y, color, size * 0.3, size, 0.9, 0, 80)
    },

    // a ring of energy closing in on (x, y) over `seconds`, brightening: an attack's warning (size = start scale)
    charge(scene, x, y, color, size, seconds) {
      pop(scene._fx.ring, x, y, color, size, size * 0.15, 0.15, 0.9, seconds * 1000)
    },

    // an enemy shot swept away (bomb, death, warp)
    fizzle(scene, x, y) {
      if (CONFIG.low && Math.random() < 0.6) return
      pop(scene._fx.glow, x, y, COLORS.ebullet, 0.12, 0.3, 0.8, 0, 200)
    },

    collect(scene, x, y, color) {
      const f = scene._fx
      pop(f.ring, x, y, color, 0.2, 1.1, 1, 0, 350)
      pop(f.glow, x, y, color, 0.2, 0.9, 0.8, 0, 300)
    },

    trail(scene, x, y, angle) {
      trailDir = deg(angle + Math.PI)
      scene._fx.trail.emitParticleAt(x, y, 1)
    },

    shockwave(scene, x, y) {
      const f = scene._fx
      pop(f.shock, x, y, 0xffffff, 0.05, 6, 1, 0, 1000)
      pop(f.shock, x, y, COLORS.accent, 0.03, 4.2, 0.9, 0, 1300) // lagging second ring
      pop(f.glow, x, y, COLORS.accent, 1, 9, 0.7, 0, 700)
      burst = { a0: 0, a1: 360, speed: 1500 }
      f.spark.particleTint = COLORS.accent
      f.spark.explode(CONFIG.low ? 25 : 70, x, y)
    },

    flash(scene, color, ms) {
      if (!Settings.flash) return
      const cam = scene.cameras.main
      cam.flashEffect.alpha = 0.55 // start alpha: a bomb reads without blinding
      cam.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, true)
    },

    shake(scene, cfg) {
      if (!Settings.shake) return
      const cam = scene.cameras.main, s = cam.shakeEffect
      // a small shake must not cut a bigger one short
      if (!s.isRunning || cfg.intensity >= s.intensity.x) cam.shake(cfg.ms, cfg.intensity, true)
    },

    spawnIn(scene, sprite, seconds) {
      if (!(seconds > 0)) return
      pop(scene._fx.ring, sprite.x, sprite.y, COLORS[sprite.texture.key] ?? 0xffffff, 1.2, sprite.width / 150, 0, 0.9, seconds * 1000)
      sprite.setAlpha(0)
      scene.tweens.addCounter({
        duration: seconds * 1000,
        onUpdate: tw => { const p = tw.getValue(); sprite.setScale(1.8 - 0.8 * p).setAlpha(p * (0.6 + 0.4 * Math.sin(p * 28))) },
        onComplete: () => sprite.setScale(1).setAlpha(1),
      })
    },
  }
})()
