// NOVA RUSH - enemy director (spawning, pacing, swarms, the sector mothership), enemy behaviors and enemy shots.
// An enemy is a Phaser Image (texture = kind, depth 10) with kind, radius, points,
// telegraph (> 0 = harmless + frozen), vx, vy, plus private motion state (speed, t, phase, dodge, jitter, mode, ...).
// Armored kinds (brute, mothership) have hp / hpMax and flash (s of white hit-flash left; GameScene.hitEnemy sets it).
// aux: the extra Image some kinds carry (darter aim line, gunner / mothership glow); it is destroyed with its enemy.
// Enemy shots are pooled Images: scene.ebullets (live), scene.ebPool (spent, hidden, reused).
// Spawn decisions draw from scene.rng.spawn (seeded in the daily challenge); the sector twist (scene.twist) bends them.

const Enemies = (() => {
  const A = CONFIG.arena, S = CONFIG.spawn, E = CONFIG.enemies, BOSS = E.boss, EB = E.bullet
  const TAU = Math.PI * 2, ADD = Phaser.BlendModes.ADD
  const rand = (a, b) => a + Math.random() * (b - a)
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
  const ramp = (t) => Math.min(1, t / S.rampSeconds) // 0..1 difficulty
  const past = (scene) => scene.sector - 1            // sectors cleared: pressure keeps rising after the ramp tops out
  // The mothership's bullet attacks and hull tint for sectors 1..5; 5+ keeps the last (all attacks, faster).
  const ATTACKS = [[], ['ring'], ['spiral'], ['fan'], ['ring', 'spiral', 'fan']]
  const HUES = [0xffffff, 0xffa090, 0xffe09a, 0xffa0dc, 0xff8080]
  const GUNNER_LOCK = { pitch: 0.75 }, BOSS_LOCK = { pitch: 0.5 } // warning chirps, lower for bigger threats

  // Random point on the border (corners favored), inset by r, at least minDist from the player.
  function edgePoint(scene, r, minDist) {
    const p = scene.player
    for (let i = 0; i < 20; i++) {
      let x, y
      if (Math.random() < 0.3) { x = Math.random() < 0.5 ? r : A.w - r; y = Math.random() < 0.5 ? r : A.h - r }
      else if (Math.random() < 0.5) { x = rand(r, A.w - r); y = Math.random() < 0.5 ? r : A.h - r }
      else { x = Math.random() < 0.5 ? r : A.w - r; y = rand(r, A.h - r) }
      if (Math.hypot(x - p.x, y - p.y) >= minDist) return [x, y]
    }
    // Farthest corner is always >= 900px away.
    return [p.x < A.w / 2 ? A.w - r : r, p.y < A.h / 2 ? A.h - r : r]
  }

  function pickKind(scene) {
    if (scene.twist.kind) return scene.twist.kind
    const open = (k) => scene.elapsed >= E[k].unlock && scene.sector >= (E[k].sector || 1)
    let total = 0
    for (const k in S.weights) if (open(k)) total += S.weights[k]
    let roll = scene.rng.spawn() * total
    for (const k in S.weights) if (open(k) && (roll -= S.weights[k]) <= 0) return k
    return 'chaser'
  }

  // A cluster of one kind at one spot on the border; members pop in one after another.
  function spawnGroup(scene, e) {
    const kind = pickKind(scene)
    const n = Math.min(E[kind].group || 9, Math.floor(S.groupStart + (S.groupEnd - S.groupStart) * e + scene.rng.spawn()))
    const [x, y] = edgePoint(scene, E[kind].radius + 50, S.minPlayerDist + 50 * Math.SQRT2) // +50: room for the scatter
    for (let i = 0; i < n; i++) Enemies.spawn(scene, kind, x + rand(-50, 50), y + rand(-50, 50), S.telegraph + i * 0.06)
  }

  function swarm(scene) {
    SFX.play('swarm')
    scene.events.emit('swarm')
    const p = scene.player, r = E.chaser.radius + 40
    const corners = [[r, r], [A.w - r, r], [r, A.h - r], [A.w - r, A.h - r]]
      .filter(([x, y]) => Math.hypot(x - p.x, y - p.y) >= S.minPlayerDist + 60)
    const n = Math.round((S.swarmMin + Math.floor(scene.rng.spawn() * (S.swarmMax - S.swarmMin + 1))) * (1 + S.sectorRate * past(scene)))
    for (let i = 0; i < n; i++) {
      const [x, y] = corners[i % corners.length]
      Enemies.spawn(scene, 'chaser', x + rand(-40, 40), y + rand(-40, 40), S.swarmTelegraph)
    }
  }

  // Launch escorts (its design's kind) from the mothership's bays, flung outward.
  function launch(scene, e) {
    for (let k = 0; k < BOSS.launchCount; k++) {
      const a = e.rotation + k * TAU / BOSS.launchCount
      const c = Enemies.spawn(scene, e.escort, e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius, 0.25)
      if (c) { c.vx = Math.cos(a) * c.speed; c.vy = Math.sin(a) * c.speed }
    }
  }

  // Ease velocity toward 'angle' at full speed; k = responsiveness (1/s).
  function steer(e, angle, k, dt) {
    const f = Math.min(1, k * dt)
    e.vx += (Math.cos(angle) * e.speed - e.vx) * f
    e.vy += (Math.sin(angle) * e.speed - e.vy) * f
  }

  // Ease velocity toward a stop; k = how fast (1/s).
  function brake(e, k, dt) {
    const f = Math.min(1, k * dt)
    e.vx -= e.vx * f
    e.vy -= e.vy * f
  }

  const atWall = (e) => e.x <= e.radius || e.x >= A.w - e.radius || e.y <= e.radius || e.y >= A.h - e.radius

  // n shots fanned `step` rad apart around angle a, leaving e's rim, with a flash at its core.
  function volley(scene, e, a, n, step, speed) {
    for (let i = 0; i < n; i++) {
      const t = a + (i - (n - 1) / 2) * step
      if (!Enemies.fire(scene, e.x + Math.cos(t) * e.radius, e.y + Math.sin(t) * e.radius, t, speed)) return // capped / sector clear
    }
    FX.muzzle(scene, e.x, e.y, COLORS.ebullet, e.radius / 60)
    SFX.play('eshot')
  }

  // One volley of a mothership attack (c = CONFIG.enemies.boss[attack], n bullets).
  const PATTERN = {
    ring: (scene, e, p, c, n) => volley(scene, e, e.spin += Math.PI / n, n, TAU / n, c.speed), // next ring: half a gap over
    spiral: (scene, e, p, c, n) => volley(scene, e, e.spin += c.turn, n, TAU / n, c.speed),
    fan: (scene, e, p, c, n) => volley(scene, e, Math.atan2(p.y - e.y, p.x - e.x), n, c.spread, c.speed),
  }

  function freeShot(scene, b) {
    b.setVisible(false)
    scene.ebPool.push(b)
  }

  // Shots fly straight, easing up to full speed. One touching the ship hurts it only if it is vulnerable
  // (invulnerable, dashing or wrecked: they pass through). One that came close while it was and gets away is a near miss.
  function moveShots(scene, dt) {
    const list = scene.ebullets, p = scene.player, hit = CONFIG.player.radius + EB.radius, m = 20
    const near = (hit + CONFIG.score.graze) ** 2, open = scene.isVulnerable()
    let n = 0, hurt = false // compact in place: live shots move to the front
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      if (b.v < b.vmax) b.v = Math.min(b.vmax, b.v + b.acc * dt)
      b.x += b.ux * b.v * dt
      b.y += b.uy * b.v * dt
      const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy
      if (open && !hurt && d2 < hit * hit) hurt = true
      else if (b.x > -m && b.x < A.w + m && b.y > -m && b.y < A.h + m) {
        if (d2 < near) b.near = b.near || open
        else if (b.near) { b.near = false; scene.graze(b.x, b.y) }
        list[n++] = b
        continue
      }
      freeShot(scene, b)
    }
    list.length = n
    if (hurt) scene.hurtPlayer(null) // after the loop: a death clears every shot (clearAll)
  }

  function clearShots(scene, withFx) {
    for (const b of scene.ebullets) {
      if (withFx) FX.fizzle(scene, b.x, b.y)
      freeShot(scene, b)
    }
    scene.ebullets.length = 0
  }

  function free(e) {
    if (e.aux) e.aux.destroy()
    e.destroy()
  }

  // Per-kind setup beyond the shared fields.
  const INIT = {
    darter(scene, e) {
      const c = E.darter
      e.mode = 'drift'
      e.modeT = rand(c.drift[0], c.drift[1])
      e.aux = scene.add.image(e.x, e.y, 'dline').setOrigin(0, 0.5).setDepth(9).setBlendMode(ADD).setVisible(false)
      e.aux.scaleX = (c.lungeSpeed * c.lunge * 1.05 + e.radius) / e.aux.width // as long as the lunge reaches
    },
    brute(scene, e) {
      e.hp = e.hpMax = e.hpSeen = E.brute.hp
      e.flash = 0
    },
    gunner(scene, e) {
      e.fireT = E.gunner.every * rand(0.7, 1.1)
      e.dir = Math.random() < 0.5 ? 1 : -1 // which way it circles
      e.dirT = rand(2, 4)
      e.aux = scene.add.image(e.x, e.y, 'glow').setTint(COLORS.ebullet).setBlendMode(ADD).setDepth(11).setVisible(false)
    },
    boss(scene, e) {
      const s = Math.min(scene.sector, ATTACKS.length) - 1
      e.hp = e.hpMax = BOSS.hp + BOSS.hpPerSector * (scene.sector - 1)
      e.points = BOSS.points * scene.sector
      e.mode = 'drift'
      e.launchT = BOSS.launchEvery
      e.chargeT = BOSS.chargeEvery
      e.attacks = ATTACKS[s]
      e.attackN = 0
      e.attackT = BOSS.attackEvery * 0.6
      e.fury = scene.sector >= ATTACKS.length
      e.spin = rand(0, TAU)
      e.flash = 0
      e.hue = HUES[s]
      e.setTint(e.hue)
      const d = Enemies.design(scene.sector)
      e.setTexture(d.tex)
      e.escort = d.escort
      e.aux = scene.add.image(e.x, e.y, 'glow').setTint(COLORS.ebullet).setBlendMode(ADD).setDepth(11).setVisible(false)
      scene.boss = e
    },
  }

  const MOVE = {
    // Lazy S-curve drift (velocity slowly rotates), steady spin; bounces off walls in update().
    wanderer(e, p, bullets, dt) {
      const turn = Math.sin(e.t * 0.8 + e.phase) * 1.4 * dt, c = Math.cos(turn), s = Math.sin(turn), vx = e.vx
      e.vx = vx * c - e.vy * s
      e.vy = vx * s + e.vy * c
      e.rotation += 2.5 * dt
    },
    // Homes with a weaving wobble; squashes along its heading like it's straining.
    chaser(e, p, bullets, dt) {
      steer(e, Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 4 + e.phase) * 0.4, 3, dt)
      const q = Math.sin(e.t * 10 + e.phase) * 0.12
      e.rotation = Math.atan2(e.vy, e.vx)
      e.setScale(1 + q, 1 - q)
    },
    // Homes, but sidesteps any bullet within senseDist that is on course to hit it.
    dodger(e, p, bullets, dt) {
      const c = E.dodger, sense2 = c.senseDist * c.senseDist, lane = e.radius * 2.5
      e.dodge -= dt
      if (e.dodge <= 0) {
        for (let i = 0; i < bullets.length; i++) {
          const b = bullets[i], dx = e.x - b.x, dy = e.y - b.y
          if (dx * dx + dy * dy > sense2 || dx * b.vx + dy * b.vy <= 0) continue // far, or moving away
          const v2 = b.vx * b.vx + b.vy * b.vy, cross = b.vx * dy - b.vy * dx // cross/|v| = miss distance
          if (cross * cross > lane * lane * v2) continue
          const k = (cross >= 0 ? c.dodgeSpeed : -c.dodgeSpeed) / Math.sqrt(v2) // perpendicular, away from the line
          e.vx = -b.vy * k
          e.vy = b.vx * k
          e.dodge = c.dodgeMove + c.dodgeRest
          break
        }
      }
      if (e.dodge <= c.dodgeRest) steer(e, Math.atan2(p.y - e.y, p.x - e.x), 4, dt)
      e.rotation += (e.dodge > c.dodgeRest ? 14 : 1.5) * dt
    },
    // Slow, heavy homing with a throbbing pulse.
    splitter(e, p, bullets, dt) {
      steer(e, Math.atan2(p.y - e.y, p.x - e.x), 2, dt)
      e.rotation += 1.2 * dt
      e.setScale(1 + Math.sin(e.t * 7) * 0.1)
    },
    // Fast, twitchy homing: re-rolls a random heading offset every ~0.1-0.35s.
    spinner(e, p, bullets, dt) {
      if ((e.jitterT -= dt) <= 0) { e.jitter = rand(-1.1, 1.1); e.jitterT = rand(0.1, 0.35) }
      steer(e, Math.atan2(p.y - e.y, p.x - e.x) + e.jitter, 5, dt)
      e.rotation += 14 * dt
    },
    // Drifts, then stops to aim: its line shows the lunge path (tracking the ship, then locked and blinking
    // for the last `lock` s); lunges straight, coasts to a stop, repeats.
    darter(e, p, bullets, dt) {
      const c = E.darter, line = e.aux
      e.modeT -= dt
      if (e.mode === 'drift') {
        steer(e, Math.atan2(p.y - e.y, p.x - e.x) + e.jitter, 2, dt)
        e.rotation = Math.atan2(e.vy, e.vx)
        if (e.modeT <= 0) { e.mode = 'aim'; e.modeT = c.aim; SFX.play('lock') }
      } else if (e.mode === 'aim') {
        brake(e, 8, dt)
        const locked = e.modeT <= c.lock
        if (!locked) e.rotation = Math.atan2(p.y - e.y, p.x - e.x)
        line.setPosition(e.x, e.y).setRotation(e.rotation).setVisible(true)
          .setAlpha(locked ? (Math.floor(e.modeT * 30) % 2 ? 0.45 : 1) : 0.2 + 0.5 * (1 - e.modeT / c.aim))
        if (e.modeT <= 0) {
          e.mode = 'lunge'
          e.modeT = c.lunge
          e.vx = Math.cos(e.rotation) * c.lungeSpeed
          e.vy = Math.sin(e.rotation) * c.lungeSpeed
          line.setVisible(false)
          SFX.play('lunge')
        }
      } else if (e.mode === 'lunge') {
        // ends on time or at a wall (update() bounced it: the velocity no longer points along the lunge),
        // stopping short so it never goes past its line
        if (e.modeT <= 0 || e.vx * Math.cos(e.rotation) + e.vy * Math.sin(e.rotation) < c.lungeSpeed * 0.98) {
          e.mode = 'rest'
          e.modeT = c.rest
          e.vx *= 0.15
          e.vy *= 0.15
        }
      } else {
        brake(e, 5, dt)
        if (e.modeT <= 0) { e.mode = 'drift'; e.modeT = rand(c.drift[0], c.drift[1]); e.jitter = rand(-0.8, 0.8) }
      }
    },
    // Armored, slow and heavy: each hit shoves it back a little. Blinks when one or two hits from death.
    brute(e, p, bullets, dt) {
      if (e.hp < e.hpSeen) {
        const a = Math.atan2(e.y - p.y, e.x - p.x), k = E.brute.knock * (e.hpSeen - e.hp)
        e.vx += Math.cos(a) * k
        e.vy += Math.sin(a) * k
        e.hpSeen = e.hp
      }
      steer(e, Math.atan2(p.y - e.y, p.x - e.x), 1.2, dt)
      e.rotation += 0.5 * dt
      e.setAlpha(e.hp <= 2 && Math.floor(e.t * 10) % 2 ? 0.6 : 1)
    },
    // Keeps its range, circling the ship with its barrel on it; then plants itself and glows (the warning)
    // and fires at the ship (a fan of 3 from fanSector on).
    gunner(e, p, bullets, dt, scene) {
      const c = E.gunner, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1
      e.rotation = Math.atan2(dy, dx)
      e.fireT -= dt
      if (e.fireT > c.windup) {
        if ((e.dirT -= dt) <= 0 || (atWall(e) && e.dirT < 1.5)) { e.dir = -e.dir; e.dirT = rand(2, 4) }
        const k = clamp((d - c.range) / 150, -1, 1), f = Math.min(1, 3 * dt) // k > 0: too far, close in; < 0: back off
        e.vx += ((dx * k - dy * e.dir) / d * e.speed - e.vx) * f
        e.vy += ((dy * k + dx * e.dir) / d * e.speed - e.vy) * f
        return
      }
      if (e.fireT + dt > c.windup) { SFX.play('lock', GUNNER_LOCK); FX.charge(scene, e.x, e.y, COLORS.ebullet, 1, c.windup) }
      brake(e, 10, dt)
      const w = 1 - Math.max(0, e.fireT) / c.windup // 0 -> 1 over the windup; blinks for the last 40%
      e.aux.setPosition(e.x, e.y).setScale(0.3 + 0.7 * w).setAlpha(w > 0.6 && Math.floor(e.fireT * 24) % 2 ? 0.35 : 0.4 + 0.6 * w).setVisible(true)
      if (e.fireT <= 0) {
        volley(scene, e, e.rotation, scene.sector >= c.fanSector ? 3 : 1, c.fanSpread, c.shotSpeed)
        e.fireT = c.every * rand(0.9, 1.1)
        e.aux.setVisible(false)
      }
    },
    // Mothership: drifts after the player launching escorts; every few seconds it shudders, then lunges.
    // From sector 2 it also stops, its core flashes (the warning), then it fires its bullet attack.
    boss(e, p, bullets, dt, scene) {
      e.rotation += (e.mode === 'windup' ? 3 : e.mode === 'fire' ? 1.5 : 0.5) * dt
      if (e.mode === 'drift') {
        steer(e, Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 0.7) * 0.8, 1.2, dt)
        if ((e.launchT -= dt) <= 0) { e.launchT = BOSS.launchEvery; launch(scene, e) }
        if ((e.chargeT -= dt) <= 0) { e.mode = 'windup'; e.modeT = BOSS.chargeWindup; e.vx = e.vy = 0 }
        else if (e.attacks.length && (e.attackT -= dt) <= 0) {
          e.attack = e.attacks[e.attackN++ % e.attacks.length]
          e.mode = 'cast'
          e.modeT = BOSS.attackWindup
          SFX.play('lock', BOSS_LOCK)
          FX.charge(scene, e.x, e.y, COLORS.ebullet, 2.6, BOSS.attackWindup)
        }
      } else if (e.mode === 'windup') {
        e.setAlpha(Math.floor(e.modeT * 16) % 2 ? 0.55 : 1)
        if ((e.modeT -= dt) <= 0) {
          const a = Math.atan2(p.y - e.y, p.x - e.x)
          e.vx = Math.cos(a) * BOSS.chargeSpeed
          e.vy = Math.sin(a) * BOSS.chargeSpeed
          e.mode = 'charge'
          e.modeT = BOSS.chargeTime
          e.setAlpha(1)
        }
      } else if (e.mode === 'charge') {
        if ((e.modeT -= dt) <= 0) { e.mode = 'drift'; e.chargeT = BOSS.chargeEvery; e.attackT = Math.max(e.attackT, 1.2) }
      } else { // cast (core flashing) -> fire (the volleys)
        brake(e, 4, dt)
        const c = BOSS[e.attack], core = e.aux.setPosition(e.x, e.y)
        if (e.mode === 'cast') {
          core.setVisible(true).setScale(0.8 + 1.8 * (1 - e.modeT / BOSS.attackWindup)).setAlpha(Math.floor(e.modeT * 12) % 2 ? 0.3 : 1)
          if ((e.modeT -= dt) <= 0) { e.mode = 'fire'; e.shots = c.shots; e.shotT = 0; core.setAlpha(0.7) }
        } else if ((e.shotT -= dt) <= 0) {
          PATTERN[e.attack](scene, e, p, c, e.fury ? Math.round(c.count * 4 / 3) : c.count)
          e.shotT += c.gap
          if (--e.shots <= 0) {
            e.mode = 'drift'
            e.attackT = BOSS.attackEvery * (e.fury ? BOSS.fury : 1)
            e.chargeT = Math.max(e.chargeT, 1.5)
            core.setVisible(false)
          }
        }
      }
    },
  }

  return {
    init(scene) {
      scene.enemies = []
      scene.ebullets = []
      scene.ebPool = []
      scene.director = { nextSpawn: S.firstSpawn, nextSwarm: S.swarmStart, bossSpawned: false }
    },

    // The next sector's mothership may come once its timer runs out.
    nextSector(scene) { scene.director.bossSpawned = false },

    // The mothership design guarding a sector: a new one every CONFIG.enemies.boss.designEvery sectors, then round again.
    design: (sector) => BOSS.designs[Math.floor((sector - 1) / BOSS.designEvery) % BOSS.designs.length],

    update(scene, dt) {
      const d = scene.director, t = scene.elapsed, calm = scene.warping > 0, tw = scene.twist
      if (!calm && !d.bossSpawned && t - scene.sectorStart >= CONFIG.sector.duration) {
        d.bossSpawned = true // it enters from the side farther from the player, clear of the HUD corners
        const x = scene.player.x < A.w / 2 ? A.w - BOSS.radius - 40 : BOSS.radius + 40
        Enemies.spawn(scene, 'boss', x, A.h / 2 + rand(-150, 150), BOSS.telegraph)
        SFX.play('bossAlarm')
        scene.events.emit('boss')
      }
      if (t >= d.nextSwarm) { if (!calm && !scene.boss && !tw.kind) swarm(scene); d.nextSwarm += S.swarmEvery / tw.swarms }
      if (t >= d.nextSpawn) {
        const e = ramp(t)
        if (!calm && d.nextSwarm - t > S.swarmLull) spawnGroup(scene, e)
        const interval = (S.startInterval + (S.endInterval - S.startInterval) * e) * (scene.boss ? S.bossSlow : 1) * tw.pace / (1 + S.sectorRate * past(scene))
        d.nextSpawn = t + interval * (1 + S.breatheAmp * Math.sin(t * TAU / S.breathePeriod))
      }

      const p = scene.player, bullets = scene.bullets, list = scene.enemies
      for (let i = 0; i < list.length; i++) {
        const e = list[i], r = e.radius
        if (e.telegraph > 0) { e.telegraph -= dt; continue }
        if (e.flash > 0 && (e.flash -= dt) <= 0) e.setTint(e.hue || 0xffffff) // armored hit-flash over
        e.t += dt
        MOVE[e.kind](e, p, bullets, dt, scene)
        let x = e.x + e.vx * dt, y = e.y + e.vy * dt
        if (x < r || x > A.w - r) { e.vx = -e.vx; x = clamp(x, r, A.w - r) }
        if (y < r || y > A.h - r) { e.vy = -e.vy; y = clamp(y, r, A.h - r) }
        e.x = x
        e.y = y
      }
      moveShots(scene, dt)
    },

    spawn(scene, kind, x, y, telegraph = S.telegraph) {
      if (scene.enemies.length >= S.maxEnemies && kind !== 'boss') return null
      const c = E[kind], r = c.radius
      const e = scene.add.image(clamp(x, r, A.w - r), clamp(y, r, A.h - r), kind)
        .setDepth(10).setBlendMode(ADD)
      e.kind = kind
      e.radius = r
      e.points = c.points
      e.telegraph = telegraph
      e.speed = c.speed * rand(0.92, 1.08)
      const a = Math.atan2(A.h / 2 - e.y, A.w / 2 - e.x) + rand(-0.6, 0.6) // initial drift: into the arena
      e.vx = Math.cos(a) * e.speed
      e.vy = Math.sin(a) * e.speed
      e.t = 0
      e.phase = rand(0, TAU)
      e.dodge = 0
      e.jitter = 0
      e.jitterT = 0
      if (INIT[kind]) INIT[kind](scene, e)
      scene.enemies.push(e)
      if (telegraph > 0) FX.spawnIn(scene, e, telegraph)
      return e
    },

    // A pooled enemy shot from (x, y) at angle a (rad), speed px/s. It starts at half speed and eases up
    // (easy to read as it leaves). None while the sector-clear beat plays.
    fire(scene, x, y, a, speed) {
      if (scene.ebullets.length >= EB.max || scene.warping > 0) return null
      const b = scene.ebPool.pop() || scene.add.image(0, 0, 'ebullet').setDepth(24)
      b.setPosition(x, y).setVisible(true)
      b.ux = Math.cos(a)
      b.uy = Math.sin(a)
      b.v = speed / 2
      b.vmax = speed
      b.acc = speed / 2 / EB.ease
      b.near = false
      scene.ebullets.push(b)
      return b
    },

    kill(scene, e, byBomb = false) {
      const i = scene.enemies.indexOf(e)
      if (i < 0) return 0 // already dead (e.g. two bullets in one frame)
      scene.enemies.splice(i, 1)
      if (e.kind === 'boss') {
        scene.boss = null
        clearShots(scene, true) // its last volleys fizzle: the win is safe to enjoy
        FX.bigExplosion(scene, e.x, e.y, COLORS.boss)
        FX.shake(scene, CONFIG.fx.shakeBoss)
        SFX.play('death')
        SFX.play('bomb')
        for (let k = 0; k < BOSS.drops; k++) Pickups.drop(scene, e.x + rand(-70, 70), e.y + rand(-70, 70), undefined, true)
        free(e)
        return e.points
      }
      FX.explode(scene, e.x, e.y, COLORS[e.kind], e.radius / 16)
      SFX.play('explode', { kind: e.kind })
      if (!byBomb) Pickups.maybeDrop(scene, e)
      if (e.kind === 'splitter' && !byBomb) {
        const n = E.splitter.children
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + rand(0, 1), c = Enemies.spawn(scene, 'spinner', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, E.splitter.childTelegraph)
          if (c) { c.vx = Math.cos(a) * c.speed; c.vy = Math.sin(a) * c.speed } // burst outward
        }
      }
      free(e)
      return byBomb ? 0 : e.points
    },

    // Destroys every enemy except the mothership, and every enemy shot (bomb, player death, warp); no score.
    clearAll(scene, withFx = true) {
      const list = scene.enemies
      let n = 0
      for (const e of list) {
        if (e.kind === 'boss') { list[n++] = e; continue }
        if (withFx) FX.explode(scene, e.x, e.y, COLORS[e.kind], 0.6)
        free(e)
      }
      list.length = n
      clearShots(scene, withFx)
    },
  }
})()
