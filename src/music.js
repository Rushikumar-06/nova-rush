// NOVA RUSH - procedural darksynth score (Web Audio only, no files), mixed under the SFX.
// A lookahead scheduler (setInterval, never rAF) polls the game for a mood each tick and schedules 16th-note
// steps ~0.12 s ahead into SFX.musicBus. Moods: title, play (energy follows the pressure), boss, warp, pause,
// over, silent (muted, music volume 0, hidden tab: nothing is scheduled). Arrangement changes land on bar lines;
// the warp, the game over and the drop back into play land on the next step. Every sector has its own key,
// progression, tempo and sound, cycling like the backdrops.

const Music = (() => {
  const AHEAD = 0.12  // s scheduled ahead of the audio clock (more after long frames): covers a late timer
  const MIX = 0.25    // music level at the default volume setting (0.6): the SFX sit on top
  const hz = m => 440 * 2 ** ((m - 69) / 12)
  const wrap = (n, lo) => lo + (((n - lo) % 12) + 12) % 12 // n moved by octaves into [lo, lo + 12)
  const pick = (list, c) => list[(c.charCodeAt(0) - 48) % list.length]
  const V = { x: 1, O: 1, o: 0.55 }                          // pattern chars: x hit, o ghost, O octave up, . rest
  const WAVE = { sine: 1.3, triangle: 1, square: 0.45, sawtooth: 0.5 } // evens out the loudness of arp waves
  const Q = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], m9: [0, 3, 7, 14], s2: [0, 2, 7], s4: [0, 5, 7] }
  const KICK = 'x...x...x...x...', SNARE = '....x.......x...', CALM = '01234321'

  // One theme per sector: key root (MIDI), tempo, a 4-bar loop of [degree, chord], arp wave / register / pattern
  // (digits pick chord tones over two octaves), bass line + filter, pad brightness + swirl (lfo depth, rate).
  const THEMES = [
    // ORION DRIFT, icy blue: E minor i-VI-III-VII, glassy triangle arps up high, bright pad
    { root: 40, bpm: 108, prog: [[0, 'm9'], [8, 'M7'], [3, 'M7'], [10, 's2']], arp: 'triangle', arpLo: 72, arpCut: 5000,
      arpPat: '0123456701234567', bass: 'x.x.x.x.x.x.x.O.', bassCut: 600, padCut: 2200, lfo: 0.2, lfoHz: 0.12 },
    // CRIMSON EXPANSE, red: D minor i-VI-iv-V, rolling 16th bass under a pulsing saw arp
    { root: 38, bpm: 116, prog: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']], arp: 'sawtooth', arpLo: 62, arpCut: 2200,
      arpPat: '0323032403230324', bass: 'xoOoxoOoxoOoxoOo', bassCut: 700, padCut: 1500, lfo: 0.15, lfoHz: 0.2 },
    // EMERALD VEIL, green gas giant: F# dorian, swung floating arps over a syncopated bass, swirling pad
    { root: 42, bpm: 100, prog: [[0, 'm7'], [5, 'M'], [3, 'M7'], [10, 'M']], arp: 'triangle', arpLo: 64, arpCut: 4000,
      arpPat: '0.2.1.3.2.4.3.5.', bass: 'x..x..x...x..x..', bassCut: 500, padCut: 1700, lfo: 0.6, lfoHz: 0.25,
      swing: 0.16, kick: 'x......x..x.....' },
    // SOLAR FURNACE, burning sun: A minor Andalusian descent i-VII-VI-V, fast square arps, octave-pumping bass
    { root: 45, bpm: 124, prog: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']], arp: 'square', arpLo: 64, arpCut: 2600,
      arpPat: '0123450123450123', bass: 'x.O.x.O.x.O.x.O.', bassCut: 800, padCut: 1900, lfo: 0.25, lfoHz: 0.3 },
    // THE VOID, black hole: C minor with the flat second, half-time drums, deep bass, sparse sine echoes
    { root: 36, bpm: 92, prog: [[0, 'm9'], [1, 'M7'], [8, 'M'], [7, 's4']], arp: 'sine', arpLo: 67, arpCut: 3000,
      arpPat: '0...3...2...5.4.', bass: 'x.......x.....o.', bassCut: 300, padCut: 1100, lfo: 0.5, lfoHz: 0.07,
      kick: 'x.........x.....', snare: '........x.......' },
  ]
  // The mothership: i-bII-bVI-V in the sector's key, a driving kick, 16th bass and a pedal-tone arp.
  const BOSS = { prog: [[0, 'm'], [1, 'M'], [8, 'M'], [7, 'M']], kick: 'x...x...x...x.o.', bass: 'xxOxxxOxxxOxxOxO', arpPat: '0102030401020304' }
  for (const T of THEMES) {
    const mk = ([r, q]) => {
      const iv = Q[q], a = wrap(T.root + r, T.arpLo)
      return { bass: wrap(T.root + r, 31), pad: iv.map(i => wrap(T.root + r + i, 55)).sort((x, y) => x - y),
        arp: iv.concat(iv.map(i => i + 12)).map(i => a + i).sort((x, y) => x - y) }
    }
    T.chords = T.prog.map(mk)
    T.boss = BOSS.prog.map(mk)
    T.win = mk([0, 'M'])                                 // sector clear: the tonic turns major
    T.jump = mk([7, 's4'])                               // warp: a suspended dominant that the arrival resolves
    T.sad = [[8, 'M'], [5, 'm'], [0, 'm']].map(mk)       // game over: VI - iv - i ...
    T.mel = [15, 14, 12].map(i => wrap(T.root, 64) + i) // ... under a falling 3 - 2 - 1
  }

  let ctx = null, out, eq, duck, dly, snareBus, hatBus, arpF, padF, lfo, lfoG, padBus = null
  let G = null, sec = 1, mood = 'silent', snap = false, level = -1, muffled = false, scooped = false, dead = false
  let T = THEMES[0], ch = T.chords[0], bpm = T.bpm, energy = 0, nextT = 0, step = 0, bar = 0, sub = 0, phase = 0
  let ahead = AHEAD, lastNow = 0
  const lv = [0, 0, 0, 0, 0, 0], tgt = [0, 0, 0, 0, 0, 0] // layer levels (kick snare hat bass arp pad); lv glides to tgt
  const count = { kick: 0, snare: 0, hat: 0, bass: 0, arp: 0, pad: 0, crash: 0 } // notes scheduled (instrumentation)
  // mood: what is playing; root: key root (MIDI) of the current sector; count / late (times the scheduler fell
  // behind and dropped steps) / error: instrumentation for checks
  const api = { count, late: 0, error: null, get mood() { return mood }, get root() { return T.root } }

  // Persistent graph: instrument buses -> out (lowpass: muffles while paused) -> eq -> duck (level) -> SFX.musicBus.
  function build(c) {
    const send = (from, to, v) => { const g = c.createGain(); g.gain.value = v; from.connect(g).connect(to) }
    out = c.createBiquadFilter()
    out.frequency.value = 20000
    eq = c.createBiquadFilter()        // mid scoop during action: a pocket for the gunfire and explosions
    eq.type = 'peaking'
    eq.frequency.value = 1400
    eq.Q.value = 0.8
    duck = c.createGain()
    duck.gain.value = 0
    out.connect(eq).connect(duck).connect(SFX.musicBus)
    // Reverb (Schroeder): two allpasses diffuse, four damped combs ring out for 1.4 s, split left/right. Only
    // single-delay loops: a ConvolverNode's setup stalls the main thread ~15 ms, and Chrome over-amplifies
    // cross-coupled delay loops (a feedback matrix blew up in testing).
    const rev = c.createGain(), wide = c.createChannelMerger(2)
    let x = rev
    for (const s of [0.0051, 0.0034]) { // allpass: w = x + 0.6 w(-s), y = w(-s) - 0.6 w
      const w = c.createGain(), d = c.createDelay(0.1), y = c.createGain()
      d.delayTime.value = s
      x.connect(w).connect(d).connect(y)
      send(d, w, 0.6)
      send(w, y, -0.6)
      x = y
    }
    ;[0.0297, 0.0371, 0.0411, 0.0437].forEach((s, i) => {
      const d = c.createDelay(0.1), f = c.createBiquadFilter()
      d.delayTime.value = s
      f.frequency.value = 3500
      f.Q.value = -3 // Butterworth: no resonant peak, so the loop gain stays under 1 at every frequency
      x.connect(d).connect(f).connect(wide, 0, i & 1)
      send(f, d, 0.001 ** (s / 1.4)) // -60 dB after 1.4 s
    })
    rev.gain.value = 0.35
    wide.connect(out)
    dly = c.createDelay(1)             // dotted-8th echo, each repeat darker
    const fb = c.createGain(), dark = c.createBiquadFilter()
    fb.gain.value = 0.35
    dark.frequency.value = 2500
    dly.connect(dark).connect(fb).connect(dly)
    dark.connect(out)
    snareBus = c.createGain()
    snareBus.connect(out)
    send(snareBus, rev, 0.3)
    hatBus = c.createStereoPanner()
    hatBus.pan.value = 0.25
    hatBus.connect(out)
    arpF = c.createBiquadFilter()
    arpF.connect(out)
    send(arpF, dly, 0.35)
    send(arpF, rev, 0.15)
    padF = c.createBiquadFilter()
    padF.connect(out)
    send(padF, rev, 0.45)
    lfo = c.createOscillator()         // slow swirl on the pad filter
    lfoG = c.createGain()
    lfo.connect(lfoG).connect(padF.frequency)
    lfo.start()
    ctx = c
  }

  // --- instruments: a few short-lived nodes per note, stopped when done ---
  function voice(type, f, t, to) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    o.connect(to)
    o.start(t)
    return o
  }
  // Percussive envelope: 4 ms attack, then an exponential fall to silence over 'decay' s.
  function env(t, peak, decay, to) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.004)
    g.gain.setTargetAtTime(0, t + 0.004, decay / 5)
    g.connect(to)
    return g
  }
  function noise(t, type, f, dur, to) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter()
    s.buffer = SFX.noise
    s.loop = true
    fl.type = type
    fl.frequency.value = f
    s.connect(fl).connect(to)
    s.start(t, Math.random() * 0.5)
    s.stop(t + dur)
  }
  function kick(t, v) {
    if (v < 0.02) return
    const o = voice('sine', 150, t, env(t, v * 0.6, 0.4, out))
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1)
    o.stop(t + 0.45)
    count.kick++
  }
  function snare(t, v) {
    if (v < 0.02) return
    noise(t, 'bandpass', 1800, 0.22, env(t, v * 0.4, 0.2, snareBus))
    const o = voice('triangle', 200, t, env(t, v * 0.3, 0.1, snareBus))
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08)
    o.stop(t + 0.15)
    count.snare++
  }
  function hat(t, v, open) {
    if (v < 0.02) return
    noise(t, 'highpass', 7000, open ? 0.28 : 0.06, env(t, v * (open ? 0.05 : 0.07), open ? 0.25 : 0.05, hatBus))
    count.hat++
  }
  function crash(t, v) {
    noise(t, 'highpass', 4500, 1.8, env(t, v * 0.06, 1.7, hatBus))
    count.crash++
  }
  function bass(t, m, v, len, type = 'sawtooth') {
    if (v < 0.02) return
    const f = ctx.createBiquadFilter(), cut = mood === 'boss' ? 800 : T.bassCut
    f.Q.value = 6
    f.frequency.setValueAtTime(cut * 3, t)
    f.frequency.setTargetAtTime(cut, t, 0.06)
    f.connect(env(t, v * 0.26, len, out))
    voice(type, hz(m), t, f).stop(t + len + 0.05)
    count.bass++
  }
  function arp(t, m, v, decay, type = T.arp) {
    if (v < 0.02) return
    voice(type, hz(m), t, env(t, v * 0.085 * WAVE[type], decay, arpF)).stop(t + decay + 0.05)
    count.arp++
  }
  // Detuned saw pair per note: slow attack, held for len, then a soft release. Pads go through padBus so a mood
  // change can fade the ones still sounding (a fresh bus serves the next ones).
  function pad(t, notes, len, v) {
    if (v < 0.02) return
    if (!padBus) { padBus = ctx.createGain(); padBus.connect(padF) }
    const g = ctx.createGain(), peak = v * 0.03, end = t + len + 1.2
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.5, len / 3))
    g.gain.setValueAtTime(peak, t + len)
    g.gain.setTargetAtTime(0, t + len, 0.22)
    g.connect(padBus)
    for (let i = 0; i < notes.length; i++) for (let k = -1; k <= 1; k += 2) {
      const o = voice('sawtooth', hz(notes[i]), t, g)
      o.detune.value = k * 9
      o.stop(end)
    }
    count.pad++
  }
  function releasePads(t) {
    if (!padBus) return
    const b = padBus
    padBus = null
    b.gain.setTargetAtTime(0, t, 0.3)
    setTimeout(() => b.disconnect(), 4000)
  }

  // --- what the game wants: read fresh each tick (scenes restart, the game may not exist yet) ---
  function poll() {
    const g = window.game, M = g && g.scene // (window.game is the <div id="game"> until main.js runs)
    G = null
    if (!M || !M.getScene || document.hidden || SFX.muted || !(Settings.music > 0)) return 'silent'
    const s = M.getScene('game')
    if (M.isActive('title') || !s || !(M.isActive('game') || M.isPaused('game'))) { sec = 1; T = THEMES[0]; return 'title' }
    G = s
    sec = s.sector || 1
    T = THEMES[(sec - 1) % THEMES.length]
    if (s.state === 'gameover') return 'over'
    if (s.state !== 'playing' || M.isPaused('game')) return 'pause' // paused, choosing an upgrade
    if (s.boss) return 'boss'
    return s.warping > 0 ? 'warp' : 'play'
  }

  function pressure() { // 0..1: enemies on screen, and the mothership getting closer
    const n = G.enemies ? G.enemies.length : 0, into = (G.elapsed - G.sectorStart) / CONFIG.sector.duration
    return Math.min(1, n / 30) * 0.7 + (Math.min(1, Math.max(0, into)) || 0) * 0.3
  }

  // Immediate changes (not quantized): volume (squared like the SFX setting), quieter and mid-scooped under the
  // action, the pause muffle, a dip when the ship dies.
  function mix(want, now) {
    const p = want === 'pause', act = want === 'play' || want === 'boss' || want === 'warp'
    const v = want === 'silent' ? 0 : MIX * (Math.min(1, Settings.music) / 0.6) ** 2 * (p ? 0.7 : act ? 0.63 : 1)
    if (v !== level) { level = v; duck.gain.setTargetAtTime(v, now, 0.1) }
    if (act !== scooped) { scooped = act; eq.gain.setTargetAtTime(act ? -6 : 0, now, 0.3) }
    const f = out.frequency
    if (p !== muffled) { muffled = p; f.cancelScheduledValues(now); f.setTargetAtTime(p ? 700 : 20000, now, p ? 0.08 : 0.25) }
    const d = !!G && G.beat > 0
    if (d && !dead && !p) { f.cancelScheduledValues(now); f.setTargetAtTime(350, now, 0.03); f.setTargetAtTime(20000, now + 0.4, 0.3) }
    dead = d
  }

  function set(k, s, h, b, a, p) { tgt[0] = k; tgt[1] = s; tgt[2] = h; tgt[3] = b; tgt[4] = a; tgt[5] = p }

  function enter(m, t, hard) {
    releasePads(t) // a chord still sounding from the old mood would clash with the new one
    mood = m
    bar = sub = 0
    phase = -1
    if (hard || m === 'warp' || m === 'over') step = 0
    snap = hard || m === 'boss' // levels jump instead of gliding, on a crash
    if (snap && (m === 'play' || m === 'boss')) crash(t, 1)
  }

  // Bar line: tempo, energy, layer levels, the next chord (pad), filter colors.
  function barStart(t) {
    const calm = mood === 'title' || mood === 'pause', boss = mood === 'boss'
    const b = mood === 'title' ? 96 : T.bpm + (boss ? 8 : 0)
    if (b !== bpm) { bpm = b; dly.delayTime.setTargetAtTime(45 / b, t, 0.05) }
    if (mood === 'play') energy += (pressure() - energy) * (snap ? 1 : 0.4)
    const e = boss ? 1 : calm ? 0 : energy
    if (calm) set(0, 0, 0, 0.5, mood === 'title' ? 0.6 : 0.35, 1)
    else set(1, 1, 0.6 + 0.4 * e, 1, 0.45 + 0.55 * e, boss ? 0.55 : 0.85 - 0.35 * e)
    if (snap) { snap = false; for (let i = 0; i < 6; i++) lv[i] = tgt[i] }
    const cb = calm ? 2 : 1, len = cb * 240 / bpm
    if (bar % cb === 0) {
      ch = (boss ? T.boss : T.chords)[(bar / cb | 0) % 4]
      pad(t, ch.pad, len, tgt[5])
      if (calm) bass(t, ch.bass, tgt[3], len, 'triangle')
    }
    arpF.frequency.setTargetAtTime(T.arpCut * (calm ? 0.5 : 0.6 + 0.5 * e), t, 0.3)
    padF.frequency.setTargetAtTime(T.padCut * (boss ? 0.6 : 1) * (0.85 + 0.3 * e), t, 0.5)
    lfoG.gain.setTargetAtTime(T.padCut * T.lfo * 0.5, t, 0.5)
    lfo.frequency.setTargetAtTime(T.lfoHz, t, 0.5)
  }

  function groove(t, s) {
    for (let i = 0; i < 6; i++) lv[i] += Math.max(-0.0625, Math.min(0.0625, tgt[i] - lv[i])) // crossfades over a bar
    if (mood === 'title' || mood === 'pause') { // pad + bass come from barStart; a slow, soft arp on top
      const k = mood === 'title' ? 1 : 2
      if (!(s & ((1 << k) - 1))) arp(t, pick(ch.arp, CALM[(s >> k) & 7]), lv[4], 0.6)
      return
    }
    const boss = mood === 'boss', e = boss ? 1 : energy, full = e >= 0.3 || !(s & 1) // calm stretches stay in 8ths
    let c = (boss ? BOSS.kick : T.kick || KICK)[s]
    if (c !== '.') kick(t, lv[0] * V[c])
    c = (!boss && T.snare || SNARE)[s]
    if (c !== '.') snare(t, lv[1] * V[c])
    if (s >= 13 && (boss ? bar % 2 : e > 0.45 && bar % 4 === 3)) snare(t, lv[1] * (0.2 + 0.12 * (s - 13))) // fill
    if (boss || e >= 0.35) hat(t, lv[2] * (s % 4 === 2 ? 1 : s & 1 ? 0.45 : 0.3), s % 4 === 2 && e >= 0.7)
    else if (s % 4 === 2) hat(t, lv[2], false)
    if (boss && s === 15) hat(t + 7.5 / bpm, lv[2] * 0.5, false) // 32nd pickup
    c = (boss ? BOSS.bass : T.bass)[s]
    if (c !== '.' && full) bass(t, ch.bass + (c === 'O' ? 12 : 0), lv[3] * V[c], 27 / bpm)
    c = (boss ? BOSS.arpPat : T.arpPat)[s]
    if (c !== '.' && full) arp(t, pick(ch.arp, c), lv[4] * (s & 3 ? 0.7 : 1), 0.25)
  }

  // Warp: the sector-clear chord, then a build on the next key's dominant that the arrival (a hard 'play') resolves.
  function warpStep(t) {
    // (the upgrade pick freezes warping ~one frame above W: that resume is the jump, not a second sector clear)
    const W = CONFIG.sector.warp, left = G ? G.warping : 0, ph = left > W + 0.1 ? 0 : 1
    if (ph !== phase) { phase = ph; sub = 0 }
    if (!ph) { // drums drop out, the tonic turns major, a bright run climbs
      if (!sub) { crash(t, 0.7); pad(t, T.win.pad, left - W, 1); bass(t, T.win.bass, 0.7, left - W, 'triangle') }
      if (sub < 12 && !(sub & 1)) arp(t, T.win.arp[(sub >> 1) % T.win.arp.length], 1 - sub * 0.06, 0.5)
      return
    }
    const N = THEMES[sec % THEMES.length], J = N.jump, p = 1 - left / W
    if (!sub) pad(t, J.pad, left, 0.9)
    if (sub % (p < 0.4 ? 4 : p < 0.75 ? 2 : 1) === 0) snare(t, 0.15 + 0.55 * p) // the roll speeds up
    if (!(sub & 1)) {
      bass(t, J.bass, 0.3 + 0.5 * p, 27 / bpm)
      arp(t, J.arp[Math.min(J.arp.length - 1, p * J.arp.length | 0)], 0.4 + 0.5 * p, 0.3, N.arp)
    }
    if (p > 0.5 && !(sub & 3)) kick(t, 0.8 * p)
  }

  // Game over: the groove stops and the pads fade, a breath of silence, VI - iv - i, then quiet.
  function overStep(t) {
    const k = sub - 12
    if (k < 0 || k > 16 || k % 8) return
    const i = k >> 3, len = i === 2 ? 3 : 120 / bpm
    pad(t, T.sad[i].pad, len, 0.8)
    bass(t, T.sad[i].bass, 0.5, len, 'triangle')
    arp(t, T.mel[i], 1, i === 2 ? 2.5 : 1.2, 'sine')
  }

  function playStep(want) {
    const t = nextT
    if (want !== mood) {
      const hard = mood === 'silent' || mood === 'title' || mood === 'warp' || mood === 'over'
      if (hard || want === 'warp' || want === 'over' || step === 0) enter(want, t, hard)
    }
    if (mood === 'warp') warpStep(t)
    else if (mood === 'over') overStep(t)
    else {
      if (step === 0) barStart(t)
      groove(t + (step & 1 && T.swing ? T.swing * 15 / bpm : 0), step)
    }
    nextT = t + 15 / bpm
    sub++
    if (++step === 16) { step = 0; bar++ }
  }

  function tick() {
    try {
      const c = SFX.ctx
      if (!c) return // no gesture yet
      if (c !== ctx) build(c)
      const want = poll(), now = c.currentTime, gap = now - lastNow
      lastNow = now
      ahead = Math.min(0.5, Math.max(AHEAD, ahead * 0.99, gap < 1 ? gap * 1.5 : 0)) // long frames delay the timer: look further ahead
      mix(want, now)
      if (want === 'silent') { if (mood !== 'silent') { releasePads(now); mood = 'silent' } return }
      if (nextT < now) { if (mood !== 'silent') api.late++; nextT = now + 0.02 } // never burst out stale steps
      while (nextT < now + ahead) playStep(want)
    } catch (e) { api.error = e }
  }
  setInterval(tick, 25)

  return api
})()
