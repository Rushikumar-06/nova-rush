// NOVA RUSH - synthesized retro SFX (Web Audio only, no files).
// Silent no-op until the first gesture, when muted, or without Web Audio.

const SFX = (() => {
  const AC = window.AudioContext || window.webkitAudioContext
  const { volume: VOLUME, minGap: MIN_GAP } = CONFIG.audio
  // Settings.sfx 0..1 -> gain, squared so equal slider steps sound even; the default (0.8) is unity.
  const sfxLevel = () => Settings.sfx > 0 ? (Math.min(1, Settings.sfx) / 0.8) ** 2 : 0
  // master (mute) -> compressor; sfx (volume setting) and musicBus (music.js sets its own level) feed master
  let ctx = null, master = null, sfx = null, musicBus = null, noiseBuf = null, level = 1
  let muted = !!Store.get('muted', false)
  const last = {}

  function unlock() {
    try {
      if (!ctx && AC) {
        ctx = new AC()
        const comp = ctx.createDynamicsCompressor() // glue loud stacks of explosions
        comp.connect(ctx.destination)
        master = ctx.createGain()
        master.gain.value = muted ? 0 : VOLUME
        master.connect(comp)
        sfx = ctx.createGain()
        sfx.gain.value = level = sfxLevel()
        sfx.connect(master)
        musicBus = ctx.createGain()
        musicBus.connect(master)
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      }
      if (ctx && ctx.state === 'suspended') ctx.resume()
    } catch (e) { ctx = null }
  }

  // Envelope: fast attack, exponential decay to silence.
  function env(vol, t, dur) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    g.connect(sfx)
    return g
  }

  // Oscillator sweeping f0 -> f1.
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    o.connect(env(vol, t, dur))
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  // Filtered noise with the filter cutoff sweeping f0 -> f1.
  function noise(filter, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    src.connect(f).connect(env(vol, t, dur))
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }

  const r = (a, b) => a + Math.random() * (b - a) // small pitch variation keeps repeats from sounding robotic

  const EXPLODE = {
    wanderer() { noise('lowpass', 2200, 180, 0.35, 0.5); tone('triangle', 260 * r(0.9, 1.1), 60, 0.3, 0.3) },
    chaser() { noise('bandpass', 3000, 300, 0.25, 0.6); tone('square', 520 * r(0.9, 1.1), 90, 0.18, 0.12) },
    dodger() { noise('highpass', 1500, 400, 0.2, 0.4); tone('sawtooth', 300, 1400 * r(0.9, 1.1), 0.12, 0.1); tone('square', 1400, 200, 0.15, 0.08, 0.08) },
    splitter() { noise('lowpass', 1400, 90, 0.6, 0.7); tone('sawtooth', 180 * r(0.9, 1.1), 40, 0.5, 0.22) },
    spinner() { noise('highpass', 4000, 1500, 0.1, 0.3); tone('square', 1500 * r(0.85, 1.15), 400, 0.07, 0.07) },
    darter() { noise('highpass', 5200, 900, 0.16, 0.45); tone('sawtooth', 1800 * r(0.9, 1.1), 260, 0.14, 0.1) },
    brute() { noise('lowpass', 1100, 45, 0.9, 0.9); tone('sine', 130 * r(0.9, 1.1), 28, 0.8, 0.6); tone('square', 260, 60, 0.3, 0.1) },
    gunner() { noise('bandpass', 2600, 250, 0.35, 0.6); tone('triangle', 760 * r(0.9, 1.1), 110, 0.28, 0.22); tone('square', 380, 90, 0.12, 0.06, 0.06) },
  }

  const SOUNDS = {
    shoot() { tone('square', 1100 * r(0.95, 1.05), 520, 0.045, 0.035) },
    explode(opts) { (EXPLODE[opts && opts.kind] || EXPLODE.chaser)() },
    death() {
      noise('lowpass', 4000, 60, 1.4, 0.9)
      tone('sawtooth', 240, 28, 1.1, 0.35)
      tone('sine', 90, 25, 1.2, 0.6)
    },
    bomb() {
      noise('bandpass', 180, 5000, 0.5, 0.7)
      noise('lowpass', 3000, 50, 1.3, 0.7, 0.05)
      tone('sine', 110, 22, 1.3, 0.8)
    },
    extraLife() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.12, 0.12, i * 0.07)) },
    swarm() { for (let i = 0; i < 3; i++) { tone('sawtooth', 440, 700, 0.18, 0.18, i * 0.26); tone('sawtooth', 700, 440, 0.08, 0.14, i * 0.26 + 0.18) } },
    respawn() { tone('sine', 200, 1400, 0.45, 0.3); tone('triangle', 400, 2800, 0.45, 0.1, 0.05) },
    powerup() { [660, 880, 1320].forEach((f, i) => tone('triangle', f, f * 1.5, 0.09, 0.16, i * 0.05)) },
    shield() { tone('sine', 900, 200, 0.35, 0.3); noise('highpass', 6000, 1000, 0.25, 0.25) },
    bossHit() { tone('square', 180 * r(0.9, 1.1), 90, 0.05, 0.06) },
    bossAlarm() { for (let i = 0; i < 4; i++) tone('sawtooth', 220, 110, 0.35, 0.2, i * 0.45) },
    // enemy fire and attack warnings (enemies.js); lock takes { pitch } (mothership lower)
    // (eshot: the spiral fires every 0.08 s: short and under the player's own shots, so volleys stay distinct ticks)
    eshot() { tone('square', 900 * r(0.95, 1.05), 320, 0.07, 0.022); noise('bandpass', 3200, 900, 0.05, 0.05) },
    lock(o) { const f = (o && o.pitch) || 1; tone('sine', 480 * f, 1300 * f, 0.22, 0.07); tone('triangle', 960 * f, 2600 * f, 0.22, 0.03) },
    lunge() { noise('bandpass', 600, 3800, 0.22, 0.3); tone('sawtooth', 260, 900, 0.16, 0.05) },
    warp() {
      noise('bandpass', 200, 6000, 1.6, 0.35)
      tone('sawtooth', 80, 1200, 1.8, 0.12)
      tone('sine', 60, 30, 1.4, 0.4, 1.0)
    },
    // movement + UI + notifications
    dash() { noise('bandpass', 700, 3200, 0.2, 0.35); tone('sine', 420, 140, 0.14, 0.08) },
    dashReady() { tone('sine', 1568, 1568, 0.07, 0.045) },
    graze() { tone('sine', 2093 * r(0.97, 1.03), 2794, 0.06, 0.05) },
    streak(o) { const k = 2 ** (Math.min((o && o.tier) || 0, 3) / 6); [440, 554, 659, 880].forEach((f, i) => tone('sawtooth', f * k, f * k, 0.1, 0.1, i * 0.06)) }, // up a tone per tier
    uiMove() { tone('triangle', 1400, 1100, 0.035, 0.07) },
    uiSelect() { tone('triangle', 880, 880, 0.07, 0.12); tone('triangle', 1320, 1320, 0.12, 0.12, 0.06) },
    uiBack() { tone('triangle', 660, 660, 0.07, 0.11); tone('triangle', 440, 440, 0.12, 0.11, 0.06) },
    upgrade() { // rising major chord on the relative major of the music's key, so it rings with the score
      const b = 60 + ((typeof Music === 'object' && Music.root || 0) + 3) % 12, f = i => 440 * 2 ** ((b + i - 69) / 12)
      ;[0, 4, 7, 12, 16].forEach((i, n) => tone('triangle', f(i), f(i), 1.1 - n * 0.1, 0.07, n * 0.05))
      tone('sawtooth', f(-12), f(-12), 0.9, 0.035)
      noise('highpass', 6000, 9000, 0.7, 0.06, 0.2)
    },
    heartbeat() { // lub-dub, every 1.2 s on the last life: soft lows (no compressor pumping), overtones carry it on laptops
      tone('sine', 95, 48, 0.16, 0.2); tone('triangle', 150, 60, 0.08, 0.12)
      tone('sine', 85, 45, 0.18, 0.15, 0.22); tone('triangle', 135, 55, 0.08, 0.09, 0.22)
    },
    toast() { tone('sine', 1175, 1175, 0.18, 0.07); tone('sine', 1568, 1568, 0.3, 0.06, 0.09) },
  }

  for (const ev of ['pointerdown', 'pointerup', 'touchend']) window.addEventListener(ev, unlock, true) // touch: only a release unlocks
  window.addEventListener('keydown', (e) => {
    unlock()
    if (e.code === 'KeyM' && !e.repeat) SFX.toggleMute()
  }, true)

  return {
    play(name, opts) {
      try {
        if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return
        const now = ctx.currentTime, v = sfxLevel()
        if (!v || now - (last[name] ?? -1) < (MIN_GAP[name] || 0)) return
        last[name] = now
        if (v !== level) sfx.gain.setTargetAtTime(level = v, now, 0.02) // the volume setting, applied live
        SOUNDS[name](opts)
      } catch (e) {}
    },
    toggleMute() {
      muted = !muted
      Store.set('muted', muted)
      if (master) master.gain.value = muted ? 0 : VOLUME
      return muted
    },
    get muted() { return muted },
    // for music.js: the shared context (null until the first gesture), 1 s of white noise, its input into the mix
    get ctx() { return ctx },
    get noise() { return noiseBuf },
    get musicBus() { return musicBus },
  }
})()
