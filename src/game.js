// NOVA RUSH - GameScene: player ship, weapons, bullets, collisions, scoring, bomb, dash, power-ups, upgrades,
// sectors (mothership -> upgrade pick -> warp), death/respawn. Keyboard + mouse, or a gamepad (Pad).
// Pausing is the HUD's job (it stays awake to run the pause menu); this scene only auto-pauses on blur.

// squared distance from (px, py) to segment (x0, y0)-(x1, y1): swept bullet hits, no tunneling
function segDist2(x0, y0, x1, y1, px, py) {
  const dx = x1 - x0, dy = y1 - y0
  const t = Phaser.Math.Clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  const ex = x0 + dx * t - px, ey = y0 + dy * t - py
  return ex * ex + ey * ey
}

class GameScene extends Phaser.Scene {
  constructor() { super('game') }

  create() {
    const { w, h } = CONFIG.arena
    this.score = 0
    this.best = this.startBest = Store.get('best', 0)
    this.lives = CONFIG.player.lives
    this.bombs = CONFIG.player.bombs
    this.multiplier = 1
    this.streak = 0
    this.kills = 0
    this.elapsed = 0
    this.state = 'playing'
    this.nextExtra = CONFIG.score.extraEvery
    this.sector = 1
    this.sectorStart = 0   // elapsed when this sector began; its mothership comes CONFIG.sector.duration later
    this.warping = 0       // s left of the sector-clear + warp sequence (nothing spawns meanwhile)
    this.boss = null
    this.bullets = []
    this.bulletPool = []   // spent bullets are hidden and reused: no garbage per shot
    this.fireCd = 0
    this.gun = 1           // wing cannon that fires next (the single stream alternates)
    this.beat = 0          // real seconds left of the death beat; > 0 = player dead
    this.stats = { shots: 0, hits: 0, maxMult: 1, dashes: 0, bombsUsed: 0, bosses: 0, pickups: 0 }
    this.moveX = this.moveY = 0 // movement input this frame (unit vector or less): the dash goes this way
    this.dashCd = 0        // s until the dash recharges
    this.ringFlash = 0     // s left of the "dash ready" ring
    this.cursor = null     // CSS cursor last set (changed only when it has to)
    this.padWas = Pad.connected
    this.setTimeScale(1)   // tween/timer time scales survive a scene restart

    Space.create(this, this.sector)
    FX.init(this)
    Enemies.init(this)
    Pickups.init(this)
    Upgrades.init(this)

    const p = this.player = this.add.image(w / 2, h / 2, 'player').setDepth(20).setScale(0.5).setRotation(-Math.PI / 2)
    p.vx = p.vy = 0
    p.invuln = 0
    p.bank = 0             // smoothed sideways speed: the ship rolls into strafes
    p.dashT = 0            // s left of the current dash (untouchable meanwhile)
    p.dashA = 0
    this.flames = [-1, 1].map(side => {
      const f = this.add.image(0, 0, 'flame').setOrigin(1, 0.5).setDepth(19).setBlendMode(Phaser.BlendModes.ADD)
      f.side = side
      return f
    })
    this.bubble = this.add.image(p.x, p.y, 'bubble').setDepth(21).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    this.ghosts = []       // dash afterimages, recycled round-robin
    for (let i = 0; i < 6; i++) {
      this.ghosts.push(this.add.image(0, 0, 'player').setDepth(19).setTint(COLORS.player).setBlendMode(Phaser.BlendModes.ADD).setVisible(false))
    }
    this.ghostI = this.ghostT = 0
    this.dashRing = this.add.graphics().setDepth(21) // small arc, redrawn only while recharging
    this.ringLit = false
    this.syncCursor()

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT')
    this.input.on('pointerdown', ptr => { if (ptr.button === 2) this.bomb() })

    // one-shot keys listen on window: Phaser's key events arrive a frame late and stop while the scene is paused
    const onKey = e => {
      if (e.repeat || this.state !== 'playing') return
      if (e.code === 'Space') this.bomb()
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dash()
      else if (e.code === 'KeyT') this.toggleAutofire()
    }
    const autoPause = () => { if (this.state === 'playing') this.togglePause() }
    window.addEventListener('keydown', onKey)
    this.game.events.on('blur', autoPause)
    this.game.events.on('hidden', autoPause)
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onKey)
      this.game.events.off('blur', autoPause)
      this.game.events.off('hidden', autoPause)
      this.input.setDefaultCursor('default')
    })

    this.scene.launch('hud')
  }

  update(time, delta) {
    const real = Math.min(delta / 1000, 0.05)
    let dt = real
    if (this.beat > 0) {
      this.beat = Math.max(0, this.beat - real)
      const { deathBeat, deathSlow } = CONFIG.player, k = 1 - this.beat / deathBeat
      const s = deathSlow + (1 - deathSlow) * k * k
      this.setTimeScale(s)
      dt *= s
      if (this.beat === 0 && this.state === 'playing') this.respawn()
    }
    const p = this.player
    Space.update(this, dt, p.x, p.y)
    if (this.state !== 'playing') return

    this.elapsed += dt
    if (this.warping > 0 && (this.warping -= dt) <= 0) this.endWarp()
    const alive = this.beat === 0
    this.readPad()
    this.aim(dt)
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
    if (this.dashCd > 0 && (this.dashCd -= dt) <= 0) this.dashReady()
    if (alive) this.movePlayer(dt)

    this.fireCd -= dt
    if (alive && this.fireCd <= 0 && this.wantsFire()) {
      this.fireCd = 1 / (CONFIG.weapon.fireRate * (this.power.rapid > 0 ? 2 : 1) * this.mods.fireRate)
      this.fire(p.rotation)
    }

    Enemies.update(this, dt)
    Pickups.update(this, dt)
    this.updateBullets(dt)
    Upgrades.update(this, dt)
    this.updateShip(dt)
    if (this.isVulnerable()) this.collidePlayer()
  }

  // Gamepad buttons (the sticks are read where they're used); a pad plugged in or out gets a toast.
  readPad() {
    if (Pad.connected !== this.padWas) {
      this.padWas = Pad.connected
      this.events.emit('toast', Pad.connected ? 'padOn' : 'padOff')
    }
    if (Pad.hit('rb') || Pad.hit('b')) this.bomb()
    if (Pad.hit('lb') || Pad.hit('lt') || Pad.hit('a')) this.dash()
    this.syncCursor()
  }

  // Mouse: face the pointer. Pad: face the right stick; with it centered, turn toward the direction of travel.
  aim(dt) {
    const p = this.player, a = Pad.aim, m = Pad.move
    if (!Pad.active) {
      const ptr = this.input.activePointer
      p.rotation = Math.atan2(ptr.y - p.y, ptr.x - p.x)
    } else if (a.x * a.x + a.y * a.y > 0.09) p.rotation = this.assist(Math.atan2(a.y, a.x))
    else if (m.x * m.x + m.y * m.y > 0.09) p.rotation = Phaser.Math.Angle.RotateTo(p.rotation, Math.atan2(m.y, m.x), 8 * dt)
  }

  // Pad aim assist (thumbsticks are imprecise): lock onto the enemy closest to the stick's line, within ~9 degrees.
  assist(a) {
    const p = this.player
    let best = 0.16, out = a
    for (const e of this.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y
      if (e.telegraph > 0 || dx * dx + dy * dy > 640000) continue
      const t = Math.atan2(dy, dx), off = Math.abs(Phaser.Math.Angle.Wrap(t - a))
      if (off < best) { best = off; out = t }
    }
    return out
  }

  // Held left mouse, a deflected right stick or RT; auto-fire (setting / T) shoots whenever enemies are around.
  wantsFire() {
    if (Settings.autofire && this.enemies.length > 0) return true
    if (Pad.active) return Pad.aim.x * Pad.aim.x + Pad.aim.y * Pad.aim.y > 0.25 || Pad.down('rt')
    return this.input.activePointer.primaryDown
  }

  movePlayer(dt) {
    const P = CONFIG.player, k = this.keys, p = this.player, { w, h } = CONFIG.arena
    let ix = (k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown)
    let iy = (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown)
    if (!ix && !iy) { ix = Pad.move.x; iy = Pad.move.y } // analog: a half-tilted stick flies at half speed
    const len = Math.max(1, Math.hypot(ix, iy))          // normalized: diagonals aren't faster
    this.moveX = ix / len
    this.moveY = iy / len
    const max = P.maxSpeed * this.mods.speed
    if (p.dashT > 0) {
      p.dashT -= dt
      const v = p.dashT > 0 ? P.dash.speed : max // leave the dash at cruising speed, not a dead stop
      p.vx = Math.cos(p.dashA) * v
      p.vy = Math.sin(p.dashA) * v
      if ((this.ghostT -= dt) <= 0) { this.ghostT = 0.022; this.ghost() }
    } else {
      // steer velocity toward the target: quick accel with input, drag to a stop without
      const dx = this.moveX * max - p.vx, dy = this.moveY * max - p.vy
      const d = Math.hypot(dx, dy), step = (ix || iy ? P.accel : P.drag) * dt
      const f = d > step ? step / d : 1
      p.vx += dx * f
      p.vy += dy * f
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    const r = P.radius
    if (p.x < r || p.x > w - r) { p.x = Phaser.Math.Clamp(p.x, r, w - r); p.vx = 0 }
    if (p.y < r || p.y > h - r) { p.y = Phaser.Math.Clamp(p.y, r, h - r); p.vy = 0 }
    if (ix || iy) { // maneuvering thrusters puff opposite the direction of travel
      const a = Math.atan2(p.vy, p.vx)
      FX.trail(this, p.x - Math.cos(a) * 22, p.y - Math.sin(a) * 22, a)
    }
  }

  // Dash: a short untouchable burst where the ship is steering (else where it drifts, else where it faces).
  dash() {
    const p = this.player
    if (this.state !== 'playing' || this.beat > 0 || this.dashCd > 0 || p.dashT > 0) return
    p.dashA = this.moveX || this.moveY ? Math.atan2(this.moveY, this.moveX)
      : p.vx * p.vx + p.vy * p.vy > 3600 ? Math.atan2(p.vy, p.vx) : p.rotation
    p.dashT = CONFIG.player.dash.time
    this.dashCd = CONFIG.player.dash.cooldown * this.mods.dashCooldown
    this.ghostT = 0
    this.stats.dashes++
    FX.collect(this, p.x, p.y, COLORS.player)
    SFX.play('dash')
    this.events.emit('dash')
  }

  dashReady() {
    this.dashCd = 0
    this.ringFlash = 0.25
    SFX.play('dashReady')
  }

  ghost() {
    const p = this.player, g = this.ghosts[this.ghostI++ % this.ghosts.length]
    g.setPosition(p.x, p.y).setRotation(p.rotation).setScale(p.scaleX, p.scaleY).setAlpha(0.5).setVisible(true)
  }

  toggleAutofire() {
    Settings.autofire = !Settings.autofire
    Settings.save()
    this.events.emit('toast', Settings.autofire ? 'autoOn' : 'autoOff')
  }

  // Wing cannons: the single stream alternates guns, x3 fires both, x6 adds a spread from the nose,
  // the SPREAD power-up fans five shots; rapid fire doubles the rate (update()).
  fire(a) {
    const W = CONFIG.weapon, p = this.player, m = this.multiplier
    const cos = Math.cos(a), sin = Math.sin(a), g = W.gunGap / 2 * (p.scaleY / 0.5)
    const shoot = (side, da = 0) => {
      const x = p.x + cos * (side ? 18 : 30) - sin * side * g, y = p.y + sin * (side ? 18 : 30) + cos * side * g
      this.addBullet(x, y, a + da, true)
      FX.muzzle(this, x, y)
    }
    if (this.power.spread > 0) for (const k of [-2, -1, 0, 1, 2]) shoot(Math.sign(k), k * 0.14)
    else if (m >= W.spreadAt) { shoot(-1); shoot(1); shoot(0, -W.spreadAngle); shoot(0, W.spreadAngle) }
    else if (m >= W.twinAt) { shoot(-1); shoot(1) }
    else shoot(this.gun = -this.gun)
    SFX.play('shoot')
  }

  // mine: fired by the ship's own guns (counts toward accuracy); drones and the like pass false
  addBullet(x, y, a, mine = false) {
    const b = this.bulletPool.pop() || this.add.image(0, 0, 'bullet').setDepth(15).setBlendMode(Phaser.BlendModes.ADD)
    const v = CONFIG.weapon.bulletSpeed * this.mods.bulletSpeed
    b.setPosition(x, y).setRotation(a).setVisible(true)
    b.vx = Math.cos(a) * v
    b.vy = Math.sin(a) * v
    b.pierce = this.mods.pierce    // enemies it may still pass through
    b.bounce = this.mods.ricochet  // walls it may still bounce off
    b.last = null                  // the enemy it just pierced (so it can't hit it twice)
    b.mine = mine
    b.counted = false
    if (mine) this.stats.shots++
    this.bullets.push(b)
    return b
  }

  freeBullet(b) {
    b.setVisible(false)
    this.bulletPool.push(b)
  }

  updateBullets(dt) {
    const { w, h } = CONFIG.arena, br = CONFIG.weapon.bulletRadius, list = this.bullets
    let n = 0 // compact in place: live bullets move to the front
    for (let i = 0; i < list.length; i++) {
      const b = list[i], x0 = b.x, y0 = b.y
      b.x += b.vx * dt
      b.y += b.vy * dt
      let hit = null
      for (const e of this.enemies) {
        if (e !== b.last && e.telegraph <= 0 && segDist2(x0, y0, b.x, b.y, e.x, e.y) <= (e.radius + br) ** 2) { hit = e; break }
      }
      if (hit) {
        const armored = hit.hp > 1 // armor stops even piercing rounds
        if (b.mine && !b.counted) { b.counted = true; this.stats.hits++ }
        this.hitEnemy(hit, b)
        if (armored || b.pierce <= 0) { this.freeBullet(b); continue }
        b.pierce--
        b.last = hit
      }
      if (b.x < 0 || b.x > w || b.y < 0 || b.y > h) {
        const cx = Phaser.Math.Clamp(b.x, 0, w), cy = Phaser.Math.Clamp(b.y, 0, h)
        FX.sparks(this, cx, cy, COLORS.bullet)
        if (b.bounce <= 0) { this.freeBullet(b); continue }
        b.bounce-- // ricochet: mirror off the wall
        if (b.x !== cx) { b.vx = -b.vx; b.x = 2 * cx - b.x }
        if (b.y !== cy) { b.vy = -b.vy; b.y = 2 * cy - b.y }
        b.rotation = Math.atan2(b.vy, b.vx)
        b.last = null
      }
      list[n++] = b
    }
    list.length = n
  }

  // Armored enemies (hp > 1) lose dmg hp per hit; everything else dies.
  hitEnemy(e, b, dmg = this.mods.damage) {
    if (e.hp > dmg) {
      e.hp -= dmg
      e.setTintFill(0xffffff)
      e.flash = 0.05
      if (b) FX.ping(this, b.x, b.y, Math.atan2(b.vy, b.vx))
      SFX.play('bossHit')
      return
    }
    this.killEnemy(e)
  }

  killEnemy(e) {
    if (!this.enemies.includes(e)) return // already dead (two hits in one frame)
    const S = CONFIG.score, boss = e.kind === 'boss', x = e.x, y = e.y
    const points = Enemies.kill(this, e) * this.multiplier
    this.score += points
    this.kills++
    this.streak++
    this.multiplier = Math.min(S.maxMult, 1 + Math.floor(this.streak / S.streakPerMult))
    this.stats.maxMult = Math.max(this.stats.maxMult, this.multiplier)
    this.best = Math.max(this.best, this.score)
    if (points > 0) this.events.emit('kill', x, y, points, e.kind)
    while (this.score >= this.nextExtra) {   // award every threshold crossed
      this.nextExtra += S.extraEvery
      this.lives++
      this.bombs++
      SFX.play('extraLife')
      this.events.emit('extralife')
    }
    if (boss) {
      this.stats.bosses++
      this.sectorClear()
    }
  }

  // Mothership down: a beat to enjoy it, the field is swept, the pilot picks an upgrade (game paused), then the warp.
  sectorClear() {
    const C = CONFIG.sector
    this.warping = C.clearDelay + C.warp
    this.events.emit('bossdown', this.sector)
    this.time.delayedCall(C.clearDelay * 1000, () => {
      if (this.state !== 'playing') return
      Enemies.clearAll(this)
      this.state = 'choosing'
      this.scene.pause()
      this.input.activePointer.primaryDown = false
      this.syncCursor()
      this.events.emit('choosing')
      let done = false
      Upgrades.offer(this, () => {
        if (done || this.state !== 'choosing') return
        done = true
        this.state = 'playing'
        this.scene.resume()
        this.syncCursor()
        this.warp()
      })
    })
  }

  warp() {
    this.player.invuln = Math.max(this.player.invuln, CONFIG.sector.warp + 0.5)
    SFX.play('warp')
    Space.warp(this, this.sector + 1)
    this.events.emit('warp', this.sector + 1)
  }

  endWarp() {
    this.sector++
    this.sectorStart = this.elapsed
    Enemies.nextSector(this)
    this.events.emit('sector', this.sector)
  }

  isVulnerable() {
    const p = this.player
    return this.state === 'playing' && this.beat === 0 && p.invuln === 0 && !(p.dashT > 0)
  }

  collidePlayer() {
    const p = this.player
    for (const e of this.enemies) {
      if (e.telegraph > 0) continue
      const r = CONFIG.player.radius + e.radius
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < r * r) return this.hurtPlayer(e)
    }
  }

  // Anything that hits the ship (an enemy body, an enemy bullet) comes here. The shield takes the hit:
  // it pops, rams the enemy that touched it (a mothership shrugs it off) and buys a second of safety.
  hurtPlayer(src = null) {
    if (!this.isVulnerable()) return false
    if (!this.shield) {
      this.hitPlayer()
      return true
    }
    const p = this.player
    this.shield = false
    p.invuln = 1
    FX.collect(this, p.x, p.y, COLORS.shield)
    FX.shake(this, CONFIG.fx.shakeBomb)
    SFX.play('shield')
    if (src && src.kind && src.kind !== 'boss') this.killEnemy(src)
    return true
  }

  hitPlayer() {
    if (this.state !== 'playing') return
    const p = this.player
    FX.explode(this, p.x, p.y, COLORS.player, 3)
    FX.flash(this, COLORS.splitter, 300)
    FX.shake(this, CONFIG.fx.shakeHit)
    SFX.play('death')
    Enemies.clearAll(this)
    // hide at center so spawns during the beat keep their distance from the respawn point
    p.setVisible(false).setPosition(CONFIG.arena.w / 2, CONFIG.arena.h / 2)
    p.vx = p.vy = p.invuln = p.dashT = 0
    this.lives--
    this.streak = 0
    this.multiplier = 1
    this.power.rapid = this.power.spread = 0
    this.shield = false
    this.beat = CONFIG.player.deathBeat
    this.events.emit('died')
    if (this.lives <= 0) this.gameOver()
  }

  respawn() {
    const p = this.player
    p.setVisible(true)
    p.invuln = CONFIG.player.invulnSeconds
    SFX.play('respawn')
  }

  bomb() {
    if (this.state !== 'playing' || this.beat > 0 || this.bombs <= 0) return
    this.bombs--
    this.stats.bombsUsed++
    FX.shockwave(this, this.player.x, this.player.y)   // first, so its sparks win the particle cap
    Enemies.clearAll(this)
    const b = this.boss                                // the mothership survives a bomb, badly hurt
    if (b && b.telegraph <= 0) {
      b.hp = Math.max(1, b.hp - Math.ceil(b.hpMax * CONFIG.enemies.boss.bombDamage))
      b.setTintFill(0xffffff)
      b.flash = 0.15
    }
    FX.flash(this, 0xffffff, 200)
    FX.shake(this, CONFIG.fx.shakeBomb)
    SFX.play('bomb')
  }

  // Engine flames stretch with forward thrust, the ship rolls into strafes, the bubble shows shield / respawn safety,
  // dash afterimages fade, and an arc around the ship shows the dash recharging.
  updateShip(dt) {
    const p = this.player, P = CONFIG.player, cos = Math.cos(p.rotation), sin = Math.sin(p.rotation)
    const lat = Phaser.Math.Clamp((-sin * p.vx + cos * p.vy) / P.maxSpeed, -1, 1)
    p.bank += (lat - p.bank) * Math.min(1, dt * 8)
    const sy = 1 - 0.25 * Math.abs(p.bank) // a roll narrows the wingspan
    p.setScale(0.5, 0.5 * sy)
    const fwd = Phaser.Math.Clamp((cos * p.vx + sin * p.vy) / P.maxSpeed, 0, 1.6)
    const len = (0.45 + 0.8 * fwd) * Phaser.Math.FloatBetween(0.85, 1.15)
    for (const f of this.flames) {
      const ox = -27.5, oy = 7 * f.side * sy
      f.setPosition(p.x + cos * ox - sin * oy, p.y + sin * ox + cos * oy).setRotation(p.rotation)
        .setScale(0.5 * len, 0.5 * sy).setAlpha(0.75 + 0.25 * Math.random()).setVisible(p.visible)
    }
    const guarded = this.shield || p.invuln > 0
    this.bubble.setVisible(p.visible && guarded).setPosition(p.x, p.y)
    if (guarded) {
      const blink = !this.shield && p.invuln < 0.5 && Math.floor(p.invuln * 12) % 2
      this.bubble.setTint(this.shield ? COLORS.shield : 0xdff6ff)
        .setAlpha(blink ? 0.15 : 0.55 + 0.2 * Math.sin(this.elapsed * 8))
        .setScale(0.5 * (1 + 0.04 * Math.sin(this.elapsed * 5)))
    }
    for (const g of this.ghosts) if (g.visible && (g.alpha -= dt * 2.8) <= 0) g.setVisible(false)

    const ring = this.dashRing
    if (this.ringLit) { ring.clear(); this.ringLit = false }
    if (this.ringFlash > 0) this.ringFlash -= dt
    if (p.visible && (this.dashCd > 0 || this.ringFlash > 0)) {
      const full = P.dash.cooldown * this.mods.dashCooldown, k = this.dashCd > 0 ? 1 - this.dashCd / full : 1
      ring.lineStyle(2.5, COLORS.player, this.dashCd > 0 ? 0.3 : 3.6 * this.ringFlash)
        .beginPath().arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath()
      this.ringLit = true
    }
  }

  // The crosshair is the CSS cursor while aiming with the mouse; hidden with a pad; the plain arrow in menus.
  syncCursor() {
    const want = this.state !== 'playing' ? 'default' : Pad.active ? 'none' : FX.cursor
    if (want !== this.cursor) this.input.setDefaultCursor(this.cursor = want)
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused'
      this.scene.pause()   // freezes update, tweens, timers, particles, camera fx (Phaser also resets held keys)
      this.input.activePointer.primaryDown = false   // a release while paused/unfocused must not leave firing stuck
    } else if (this.state === 'paused') {
      this.state = 'playing'
      this.scene.resume()
    }
    this.syncCursor()
  }

  // Pause menu actions. start() on this scene's own key restarts it; the HUD / upgrade overlays go with it.
  restartRun() {
    this.saveBest()
    this.scene.stop('upgrade')
    this.scene.stop('hud')
    this.scene.start('game')
  }

  quitToTitle() {
    this.saveBest()
    this.scene.stop('upgrade')
    this.scene.stop('hud')
    this.scene.start('title')
  }

  saveBest() {
    const newBest = this.score > this.startBest
    if (newBest) Store.set('best', this.score)
    return newBest
  }

  gameOver() {
    this.state = 'gameover'
    const newBest = this.saveBest()
    this.bullets.forEach(b => this.freeBullet(b))
    this.bullets.length = 0
    this.flames.forEach(f => f.setVisible(false))
    this.bubble.setVisible(false)
    this.ghosts.forEach(g => g.setVisible(false))
    this.dashRing.clear()
    this.syncCursor()
    const s = this.stats
    const payload = { score: this.score, best: this.best, newBest, elapsed: this.elapsed, kills: this.kills, sector: this.sector,
      shots: s.shots, hits: s.hits, maxMult: s.maxMult, bosses: s.bosses, upgrades: this.upgrades.slice() }
    this.events.emit('gameover', payload)
    this.scene.launch('gameover', payload)
  }

  // slow motion for everything time-based in this scene
  setTimeScale(s) {
    this.tweens.timeScale = s
    this.time.timeScale = s
    for (const o of this.sys.updateList.getActive()) if (o.type === 'ParticleEmitter') o.timeScale = s
  }
}
