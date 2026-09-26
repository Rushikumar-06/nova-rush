// NOVA RUSH - shared config. Every tuning number lives here.
// Loaded first (classic script); everything below is global.

const CONFIG = {
  arena: { w: 1600, h: 900 },
  low: false,             // set at boot when the browser draws WebGL in software: fewer effects

  player: {
    maxSpeed: 430,        // px/s
    accel: 3200,          // px/s^2 toward input direction
    drag: 2600,           // px/s^2 when no input
    radius: 14,           // hitbox (the ship art is bigger)
    lives: 2,
    bombs: 2,
    invulnSeconds: 2,
    deathBeat: 0.6,       // s (real time) of slow motion after a death, then respawn
    deathSlow: 0.35,      // time scale at the start of the death beat (eases back to 1)
    dash: { speed: 1250, time: 0.14, cooldown: 1.0 }, // px/s burst, s it lasts (invulnerable meanwhile), s to recharge
  },

  weapon: {
    fireRate: 10,         // shots/s while left mouse held
    bulletSpeed: 1000,    // px/s
    bulletRadius: 4,
    gunGap: 19,           // px between the two wing cannons
    spreadAngle: 0.16,    // rad between spread shots
    twinAt: 3,            // multiplier >= this -> both cannons every shot
    spreadAt: 6,          // multiplier >= this -> 3-way spread
  },

  score: {
    streakPerMult: 25,    // multiplier = 1 + floor(streak / 25)
    maxMult: 10,
    extraEvery: 150000,   // +1 life and +1 bomb per this many points
  },

  spawn: {
    startInterval: 1.0,   // s between spawn groups at t=0
    endInterval: 0.3,     // s between spawn groups at t=rampSeconds
    rampSeconds: 240,
    groupStart: 1,        // enemies per group at t=0
    groupEnd: 5,          // enemies per group at t=rampSeconds
    speedRamp: 0.25,      // enemy speed multiplier grows 1 -> 1.25 over rampSeconds
    minPlayerDist: 250,
    telegraph: 0.6,       // s of harmless fade-in before an enemy acts
    maxEnemies: 150,
    swarmStart: 45,       // s
    swarmEvery: 20,       // s
    swarmMin: 6,
    swarmMax: 10,
    swarmLull: 3,         // s without regular spawns right before a swarm
    swarmTelegraph: 1.2,  // s swarm chasers take to materialize (the warning window)
    firstSpawn: 1,        // s of calm at the start of a run
    breatheAmp: 0.35,     // spawn interval swings +-35% ...
    breathePeriod: 18,    // ... over this many seconds (waves of calm / pressure)
    bossSlow: 2,          // regular spawn interval x this while a mothership is alive
    weights: { wanderer: 3, chaser: 3, dodger: 2, splitter: 1.5, darter: 1.3, brute: 0.9, gunner: 1.2 }, // relative odds once unlocked
  },

  // unlock = seconds survived before this type can spawn (spinner only comes from splitters and motherships)
  // sector = first sector it can spawn in; group = most of this kind in one spawn group
  enemies: {
    wanderer: { radius: 16, speed: 70,  points: 25,  unlock: 0 },
    chaser:   { radius: 16, speed: 160, points: 50,  unlock: 0 },
    dodger:   { radius: 16, speed: 175, points: 100, unlock: 30, senseDist: 140, dodgeSpeed: 320,
                dodgeMove: 0.2, dodgeRest: 0.15 }, // s sidestepping, then s before it can sense bullets again
    splitter: { radius: 20, speed: 110, points: 150, unlock: 60, children: 3, childTelegraph: 0.15 },
    spinner:  { radius: 9,  speed: 240, points: 50 },
    // drifts [min, max] s, stops to aim (its line tracks the ship, then locks for the last `lock` s), lunges, rests
    darter:   { radius: 14, speed: 90,  points: 125, unlock: 40, group: 3, drift: [1.2, 2.2], aim: 0.7, lock: 0.2,
                lungeSpeed: 750, lunge: 0.6, rest: 0.5 },
    // armored: each hit takes hp and shoves it back `knock` px/s
    brute:    { radius: 30, speed: 48,  points: 400, unlock: 75, group: 2, hp: 6, knock: 45 },
    // circles the ship at `range`; every `every` s it glows for `windup` s, then fires (a 3-shot fan from fanSector)
    gunner:   { radius: 17, speed: 150, points: 250, unlock: 100, sector: 2, group: 2, range: 350, every: 2.8, windup: 0.5,
                shotSpeed: 330, fanSector: 3, fanSpread: 0.22 },
    bullet:   { radius: 6, max: 250, ease: 0.4 }, // enemy shots: hitbox (the orb art is ~7), pool cap, s from half to full speed
    // the mothership that guards each sector
    boss: { radius: 58, speed: 60, points: 5000, hp: 70, hpPerSector: 35, telegraph: 1.5,
            launchEvery: 3.5, launchCount: 3,          // spinners launched from its bays
            chargeEvery: 7, chargeWindup: 0.8, chargeTime: 0.7, chargeSpeed: 560,
            bombDamage: 0.2, drops: 3,                 // a bomb takes 20% of its max hp
            // bullet attacks from sector 2 (which ones: Enemies ATTACKS): s apart, s its core flashes first;
            // sector 5+ uses them all, `fury` x as far apart, with a third more bullets
            attackEvery: 4.5, attackWindup: 0.8, fury: 0.7,
            ring:   { shots: 2,  gap: 0.45, count: 16, speed: 220 },             // shots = volleys, gap = s between
            spiral: { shots: 26, gap: 0.08, count: 3,  speed: 230, turn: 0.2 },  // turn = rad per volley
            fan:    { shots: 3,  gap: 0.3,  count: 5,  speed: 300, spread: 0.2 } }, // spread = rad between bullets
  },

  sector: {
    duration: 60,         // s of play before the mothership arrives
    clearDelay: 1.4,      // s between the mothership exploding and the warp
    warp: 2.4,            // s the warp to the next sector takes
  },

  pickups: {
    chance: 0.035,        // drop odds per kill
    splitterChance: 0.1,  // drop odds for the big ones (splitters, brutes)
    max: 3,               // on screen at once
    life: 12,             // s before an uncollected one vanishes (blinks for the last 3)
    magnet: 150,          // px: pulled toward the ship inside this range
    radius: 16,
    duration: 10,         // s rapid fire / spread shot last
    weights: { rapid: 3, spread: 3, shield: 2.5, bomb: 0.75 },
  },

  fx: {
    shakeHit: { ms: 400, intensity: 0.012 },
    shakeBomb: { ms: 300, intensity: 0.01 },
    shakeBoss: { ms: 700, intensity: 0.016 },
    sparks: 18,           // spark particles per explosion (x0.35 in low mode)
    embers: 4,
  },

  audio: {
    volume: 0.6,                                             // master gain
    // s between repeats of the same SFX: many enemies firing / locking in one frame make one sound, not a stack
    minGap: { shoot: 0.075, explode: 0.03, bossHit: 0.07, eshot: 0.06, lock: 0.12, lunge: 0.1,
      dash: 0.1, dashReady: 0.3, uiMove: 0.03, uiSelect: 0.08, uiBack: 0.08, upgrade: 0.5, heartbeat: 0.5, toast: 0.25 },
  },

  hud: { maxIcons: 6 },   // life/bomb icons shown before a "+N" counter
}

const COLORS = {
  bg: 0x05060d,
  border: 0x00e5ff,
  player: 0x00e5ff,
  bullet: 0xfff27a,
  wanderer: 0xb14dff,
  chaser: 0x3d8bff,
  dodger: 0x39ff6a,
  splitter: 0xff4fa3,
  spinner: 0xff3df5,
  boss: 0xff6a2d,
  darter: 0xc6ff3a,
  brute: 0x2effc4,
  gunner: 0xd8e4ff,
  ebullet: 0xff2d55,      // enemy shots
  rapid: 0xff9a1f,
  spread: 0xd94dff,
  shield: 0x4fe3ff,
  text: 0xe8f7ff,
  accent: 0xffd23d,
  warning: 0xff2d6f,
}

// localStorage that never throws (private windows / blocked storage).
// Keys keep the old name's 'neonswarm.' prefix: changing it would reset saved best scores and settings.
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('neonswarm.' + key)
      return v === null ? fallback : JSON.parse(v)
    } catch (e) { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem('neonswarm.' + key, JSON.stringify(value)) } catch (e) {}
  },
}

// Player options (title / pause menus), remembered. Settings.save() after changing a field.
const Settings = Object.assign({ music: 0.6, sfx: 0.8, shake: true, flash: true, autofire: false, fps: !!Store.get('fps', false) },
  Store.get('settings', {}))
Settings.save = () => Store.set('settings', Settings)
