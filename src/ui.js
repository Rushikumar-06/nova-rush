// NOVA RUSH - UI: glowing labels and bitmap numbers, menus (keyboard / gamepad / mouse), the settings panel,
// and the Title, HUD (with the pause menu and the first-run tutorial) and Game Over scenes.

const UI_FONT = 'Montserrat, "Segoe UI", "Helvetica Neue", Arial, sans-serif' // system fonts only (offline)

const uiHex = (c) => '#' + c.toString(16).padStart(6, '0')
const uiFmt = (n) => Math.floor(n).toLocaleString('en-US')
const uiTime = (s) => {
  s = Math.floor(s)
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
const uiDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

// Glowing text painted once into a cached texture and shown as an Image. (x, y) anchors the visible glyphs,
// not the glow padding: originX 0 = left, 0.5 = center, 1 = right. Canvas text with a blur glow takes up to
// ~140 ms to build in Firefox, so nothing builds it mid-game: the title screen pre-paints every in-game label.
function uiLabel(scene, x, y, str, size, color, o = {}) {
  const { glow = color, blur = 12, originX = 0.5, spacing = 0, weight = 'bold', stroke = 0, align = 'left', lineSpacing = 0 } = o
  const key = ['lbl', str, size, color, glow, blur, spacing, weight, stroke, align, lineSpacing].join('|')
  const pad = blur + 4
  if (!scene.textures.exists(key)) {
    const t = scene.make.text({ x: 0, y: 0, text: str, add: false, style: {
      fontFamily: UI_FONT, fontSize: size + 'px', fontStyle: weight, color, align,
      padding: { x: pad, y: pad }, stroke: glow, strokeThickness: stroke,
      shadow: { offsetX: 0, offsetY: 0, color: glow, blur, fill: blur > 0, stroke: blur > 0 && stroke > 0 },
    } })
    if (spacing) t.setLetterSpacing(spacing)
    if (lineSpacing) t.setLineSpacing(lineSpacing)
    const c = document.createElement('canvas') // a copy: the Text's own canvas goes back to Phaser's pool
    c.width = t.canvas.width
    c.height = t.canvas.height
    c.getContext('2d').drawImage(t.canvas, 0, 0)
    scene.textures.addCanvas(key, c)
    t.destroy()
  }
  const img = scene.add.image(x + pad * (2 * originX - 1), y, key).setOrigin(originX, 0.5)
  img.pad = pad // glow padding per side: the visible text is width - 2 * pad wide
  return img
}

// Label styles shared by several entries.
const UI_CYAN = uiHex(COLORS.player)
const uiItem = (s) => [s, 30, '#e6fdff', { glow: UI_CYAN, blur: 12, spacing: 8, weight: '900' }] // menu entry
const uiRow = (s) => [s, 19, '#e8f7ff', { blur: 0, spacing: 4, originX: 0 }]                     // settings row
const uiCap = (s, size = 13) => [s, size, '#8fb4d9', { blur: 0, spacing: 4 }]                     // caption
const uiHint = (s) => [s, 13, '#6f93bd', { blur: 0, spacing: 4 }]                                 // key help line
const uiToast = (s) => [s, 16, '#ffffff', { glow: UI_CYAN, blur: 10, spacing: 5, weight: '900', originX: 1 }]
const uiTip = (s) => [s, 24, '#e6fdff', { glow: UI_CYAN, blur: 12, spacing: 4 }]                  // tutorial hint

// Every label shown during play or right after it (HUD, pause menu, settings, tutorial, game over):
// id -> [text, size, color, options]. The title screen pre-paints them all.
const UI_TEXT = {
  score: ['SCORE', 13, '#5fb8d6', { blur: 0, spacing: 5, originX: 0 }],
  best: ['BEST', 15, uiHex(COLORS.accent), { blur: 0, spacing: 2, originX: 0 }],
  dailyBest: ['DAILY BEST', 15, uiHex(COLORS.accent), { blur: 0, spacing: 2, originX: 0 }],
  mothership: ['MOTHERSHIP', 14, uiHex(COLORS.boss), { blur: 8, spacing: 6 }],
  muted: ['MUTED', 14, '#6f93bd', { blur: 0, spacing: 4, originX: 1 }],
  fps: ['FPS', 12, '#6f93bd', { blur: 0, spacing: 3, originX: 1 }],
  swarm: ['SWARM INCOMING', 60, '#ffffff', { glow: uiHex(COLORS.warning), blur: 24, spacing: 10, weight: '900' }],
  life: ['+1 LIFE   +1 BOMB', 60, '#ffffff', { glow: uiHex(COLORS.accent), blur: 24, spacing: 10, weight: '900' }],
  boss: ['MOTHERSHIP INBOUND', 60, '#ffffff', { glow: uiHex(COLORS.boss), blur: 24, spacing: 10, weight: '900' }],
  clear: ['SECTOR CLEAR', 60, '#ffffff', { glow: uiHex(COLORS.accent), blur: 24, spacing: 10, weight: '900' }],
  rapid: ['RAPID FIRE', 30, '#ffffff', { glow: uiHex(COLORS.rapid), blur: 14, spacing: 6, weight: '900' }],
  spread: ['SPREAD SHOT', 30, '#ffffff', { glow: uiHex(COLORS.spread), blur: 14, spacing: 6, weight: '900' }],
  shield: ['SHIELD', 30, '#ffffff', { glow: uiHex(COLORS.shield), blur: 14, spacing: 6, weight: '900' }],
  bomb: ['+1 BOMB', 30, '#ffffff', { glow: uiHex(COLORS.accent), blur: 14, spacing: 6, weight: '900' }],
  autoOn: uiToast('AUTO-FIRE ON'), autoOff: uiToast('AUTO-FIRE OFF'),
  padOn: uiToast('GAMEPAD CONNECTED'), padOff: uiToast('GAMEPAD DISCONNECTED'),
  tMove: uiTip('MOVE WITH  WASD  OR THE ARROW KEYS'), tMovePad: uiTip('MOVE WITH THE LEFT STICK'),
  tFire: uiTip('AIM WITH THE MOUSE  ·  HOLD LEFT CLICK TO FIRE'), tFirePad: uiTip('AIM AND FIRE WITH THE RIGHT STICK'),
  tDash: uiTip('PRESS  SHIFT  TO DASH THROUGH DANGER'), tDashPad: uiTip('PRESS  LB  TO DASH THROUGH DANGER'),
  tBomb: uiTip('SPACE  OR  RIGHT CLICK  BOMBS THE SWARM'), tBombPad: uiTip('PRESS  RB  TO BOMB THE SWARM'),
  tMoveTouch: uiTip('DRAG ON THE LEFT SIDE TO MOVE'), tFireTouch: uiTip('DRAG ON THE RIGHT SIDE TO AIM AND FIRE'),
  tDashTouch: uiTip('TAP  DASH  TO DASH THROUGH DANGER'), tBombTouch: uiTip('TAP  BOMB  TO BOMB THE SWARM'),
  nearMiss: ['NEAR MISS', 16, '#e6fdff', { glow: UI_CYAN, blur: 10, spacing: 5, weight: '900' }],
  paused: ['PAUSED', 110, '#e6fdff', { glow: UI_CYAN, blur: 28, spacing: 14, weight: '900' }],
  resume: uiItem('RESUME'), restart: uiItem('RESTART'), settings: uiItem('SETTINGS'), quit: uiItem('QUIT TO TITLE'),
  upgrades: uiCap('UPGRADES'), pauseKeys: uiHint('P / ESC  RESUME'), pausePad: uiHint('START / B  RESUME'),
  setTitle: ['SETTINGS', 44, '#e6fdff', { glow: UI_CYAN, blur: 18, spacing: 14, weight: '900' }],
  daily: uiItem('DAILY CHALLENGE'), hangar: uiItem('HANGAR'),
  hangarTitle: ['HANGAR', 44, '#e6fdff', { glow: UI_CYAN, blur: 18, spacing: 14, weight: '900' }],
  shipRow: uiRow('SHIP'), colorRow: uiRow('COLOR'),
  hangarKeys: uiHint('ARROWS  CHOOSE + CHANGE    ESC  BACK'), hangarPad: uiHint('D-PAD  CHOOSE + CHANGE    B  BACK'),
  music: uiRow('MUSIC'), sfx: uiRow('SOUND EFFECTS'), shake: uiRow('SCREEN SHAKE'), flash: uiRow('FLASHES'),
  autofire: uiRow('AUTO-FIRE'), fpsRow: uiRow('FPS COUNTER'), fullscreen: uiRow('FULLSCREEN'), back: uiItem('BACK'),
  on: ['ON', 15, '#e6fdff', { glow: UI_CYAN, blur: 8, spacing: 3, weight: '900', originX: 1 }],
  off: ['OFF', 15, '#6f93bd', { blur: 0, spacing: 3, weight: '900', originX: 1 }],
  setKeys: uiHint('ARROWS  CHOOSE + ADJUST    ENTER  SELECT    ESC  BACK'),
  setPad: uiHint('D-PAD  CHOOSE + ADJUST    A  SELECT    B  BACK'),
  gameover: ['GAME OVER', 120, '#ffe6f2', { glow: uiHex(COLORS.splitter), blur: 30, spacing: 8, weight: '900', stroke: 4 }],
  goScore: ['SCORE', 16, '#8fb4d9', { blur: 0, spacing: 8 }],
  goBest: ['BEST', 26, uiHex(COLORS.accent), { blur: 10, spacing: 4, originX: 1 }],
  goDailyBest: ['DAILY BEST', 26, uiHex(COLORS.accent), { blur: 10, spacing: 4, originX: 1 }],
  newBest: ['NEW BEST!', 60, '#fff6d0', { glow: uiHex(COLORS.accent), blur: 26, spacing: 6, weight: '900' }],
  goRun: uiCap('THIS RUN', 14), goTop: uiCap('TOP RUNS', 14),
  goTime: uiCap('TIME'), goKills: uiCap('KILLS'), goSector: uiCap('SECTOR'),
  goAcc: uiCap('ACCURACY'), goMult: uiCap('MAX MULTIPLIER'), goBoss: uiCap('MOTHERSHIPS'),
  goPct: ['%', 24, '#ffffff', { glow: UI_CYAN, blur: 8, weight: '900', originX: 0 }],
  lbScore: uiHint('SCORE'), lbSector: uiHint('SECTOR'), lbTime: uiHint('TIME'), lbDate: uiHint('DATE'),
  again: uiItem('PLAY AGAIN'), menu: uiItem('MENU'),
  goKeys: uiHint('ENTER / R  PLAY AGAIN      ESC  MENU'), goPad: uiHint('A  PLAY AGAIN      B  MENU'),
}
// Kill-streak callouts, one per doubling of the streak from CONFIG.score.callout (50, 100, 200, 400); past the end the last repeats.
const UI_STREAK = [['RAMPAGE', COLORS.rapid], ['UNSTOPPABLE', COLORS.spread], ['GODLIKE', COLORS.accent], ['SUPERNOVA', COLORS.spinner]]
UI_STREAK.forEach(([name, color], i) => {
  UI_TEXT['streak' + i] = [name, 56, '#ffffff', { glow: uiHex(color), blur: 24, spacing: 10, weight: '900' }]
  UI_TEXT['streakSub' + i] = [`${CONFIG.score.callout * 2 ** i} KILL STREAK`, 22, '#cfe6ff', { blur: 0, spacing: 8 }]
})
// Sector twists: a banner as the sector starts, then a tag under the sector name.
CONFIG.sector.twists.forEach(({ name }, i) => {
  UI_TEXT['twist' + i] = [name, 44, '#ffffff', { glow: uiHex(COLORS.warning), blur: 24, spacing: 8, weight: '900' }]
  UI_TEXT['twistTag' + i] = [name, 13, uiHex(COLORS.warning), { blur: 6, spacing: 4 }]
})
// Achievement toasts: a ship color unlocked.
CONFIG.colors.forEach(({ name, color }, i) => {
  UI_TEXT['unlock' + i] = [`${name} SHIP COLOR UNLOCKED`, 16, '#ffffff', { glow: uiHex(color), blur: 10, spacing: 5, weight: '900', originX: 1 }]
})
const uiText = (scene, x, y, id) => uiLabel(scene, x, y, ...UI_TEXT[id])
const uiSectorText = (scene, n) => uiLabel(scene, 0, 0, 'SECTOR ' + n, 60, '#ffffff', { glow: UI_CYAN, blur: 24, spacing: 10, weight: '900' })
const uiSectorName = (scene, x, y, n) => uiLabel(scene, x, y, `SECTOR ${n}  ·  ${Space.name(n)}`, 13, '#8fb4d9', { blur: 0, spacing: 4 })
const uiSectorSub = (scene, n) => uiLabel(scene, 0, 82, Space.name(n), 24, '#cfe6ff', { blur: 0, spacing: 8 }) // under the banner

// Numbers that change every frame (score, time) use bitmap fonts: glyphs painted once, then drawn as quads.
const UI_NUM = '0123456789,:x+'
const UI_NUM_FONTS = {} // key -> { size: painted px, cw: cell width }
function uiNumFont(scene, key, size, color, glow, blur) {
  const pad = blur + 3, cw = Math.ceil(size * 0.75) + 2 * pad, ch = Math.ceil(size * 1.25) + 2 * pad
  const tex = scene.textures.createCanvas(key, cw * UI_NUM.length, ch), c = tex.context
  c.font = `bold ${size}px ${UI_FONT}`
  c.textBaseline = 'middle'
  c.fillStyle = color
  c.shadowColor = glow
  c.shadowBlur = blur
  const adv = [...UI_NUM].map((chr, i) => { c.fillText(chr, i * cw + pad, ch / 2); return c.measureText(chr).width })
  tex.refresh()
  const font = Phaser.GameObjects.RetroFont.Parse(scene, { image: key, width: cw, height: ch, chars: UI_NUM, charsPerRow: UI_NUM.length })
  ;[...UI_NUM].forEach((chr, i) => { // proportional: advance by the real glyph width, glow padding hangs outside
    const g = font.data.chars[chr.charCodeAt(0)]
    g.xAdvance = Math.ceil(adv[i]) + 1
    g.xOffset = -pad
  })
  scene.cache.bitmapFont.add(key, font)
  UI_NUM_FONTS[key] = { size, cw }
}
function uiFonts(scene) {
  uiNumFont(scene, 'numW', 48, '#ffffff', UI_CYAN, 10)
  uiNumFont(scene, 'numY', 48, uiHex(COLORS.accent), uiHex(COLORS.accent), 8)
  uiNumFont(scene, 'numBig', 96, '#ffffff', UI_CYAN, 20)
  uiTextures(scene)
}
const uiNum = (scene, x, y, key, px, originX = 0) =>
  scene.add.bitmapText(x, y, key, '', UI_NUM_FONTS[key].cw * px / UI_NUM_FONTS[key].size).setOrigin(originX, 0.5)

// Settings switches and the last-life vignette, painted once at boot.
function uiTextures(scene) {
  for (const on of [false, true]) {
    const t = scene.textures.createCanvas(on ? 'uiSwOn' : 'uiSwOff', 72, 40), c = t.context
    c.translate(36, 20)
    c.beginPath(); c.roundRect(-25, -12, 50, 24, 12)
    c.fillStyle = on ? 'rgba(0,229,255,0.25)' : 'rgba(111,147,189,0.1)'; c.fill()
    c.shadowColor = UI_CYAN; c.shadowBlur = on ? 10 : 0
    c.lineWidth = 2; c.strokeStyle = on ? UI_CYAN : '#3a5575'; c.stroke()
    c.beginPath(); c.arc(on ? 12 : -12, 0, 8, 0, Math.PI * 2)
    c.fillStyle = on ? '#ffffff' : '#6f93bd'; c.fill()
    t.refresh()
  }
  // soft edges around a clear middle: painted small, stretched over the screen and tinted by the HUD
  const v = scene.textures.createCanvas('uiVignette', 320, 180), c = v.context
  c.scale(1, 180 / 320) // an ellipse that fits the 16:9 screen
  const g = c.createRadialGradient(160, 160, 60, 160, 160, 226)
  for (const [o, a] of [[0, 0], [0.35, 0.06], [0.7, 0.5], [1, 1]]) g.addColorStop(o, `rgba(255,255,255,${a})`)
  c.fillStyle = g
  c.fillRect(0, 0, 320, 320)
  v.refresh()
}

// F toggles the FPS counter from any screen (also in the settings).
window.addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.repeat) { Settings.fps = !Settings.fps; Settings.save() } })

// Neon tube "power on": random flicker that settles fully lit.
const uiFlickerEase = (v) => (Math.random() < v * v ? 1 : 0.15)

// Hero ship with live engine flames (title screen).
function uiShowShip(scene, x, y, scale) {
  const ship = scene.add.image(x, y, 'player').setScale(scale).setRotation(-Math.PI / 2)
  const flames = [-1, 1].map(side => scene.add.image(0, 0, 'flame').setOrigin(1, 0.5).setRotation(-Math.PI / 2).setBlendMode(Phaser.BlendModes.ADD))
  const k = scale * 2 // texture pixels are half-size ship units
  ship.flicker = () => {
    const [sl, sw] = Ship.kind.shape || [1, 1] // the hangar's pick stretches the art: the nozzles move with it
    flames.forEach((f, i) => f.setPosition(ship.x + (i ? 7 : -7) * k * sw, ship.y + 27.5 * k * sl)
      .setScale(scale * Phaser.Math.FloatBetween(0.75, 0.95), scale).setAlpha(0.8 + 0.2 * Math.random()))
  }
  return ship
}

// Menu input. Keys come from a window listener (Phaser's key events stop while a scene is paused and arrive a
// frame late); held arrows repeat. Pad: d-pad or a left-stick flick, A = select, B = back.
const UI_KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back' }
const UI_PAD = { up: 'up', down: 'down', left: 'left', right: 'right', a: 'ok', b: 'back' }
// Help for the device in use: list = [keyboard + mouse, gamepad, touch] (a missing one shows nothing; touch taps the menus).
const uiShowFor = (list, on = true) => list.forEach((o, i) => o.setVisible(on && i === (Pad.touch ? 2 : Pad.active ? 1 : 0)))
function uiKeys(scene, fn) {
  const on = (e) => { if (!e.repeat || /^(up|down|left|right)$/.test(UI_KEYS[e.code])) fn(e.code) }
  window.addEventListener('keydown', on)
  scene.events.once('shutdown', () => window.removeEventListener('keydown', on))
}

// A focus list with a glowing frame on the focused item. item: { x, y, w, h, parts, pick(), adjust?(dir),
// click?(pointer) }; parts light up with focus. Mouse: hover focuses, press + release on the same item picks.
// across: left / right move the focus too (a row of buttons). off: ignore input.
class UiMenu {
  constructor(scene, layer, items, back = null, across = false) {
    Object.assign(this, { items, back, across, i: 0, off: false })
    this.frame = scene.add.graphics()
    layer.addAt(this.frame, layer.getIndex(items[0].parts[0])) // under the labels
    scene.tweens.add({ targets: this.frame, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    let armed = null
    items.forEach((it, i) => {
      const z = scene.add.zone(it.x, it.y, it.w, it.h).setInteractive({ useHandCursor: true })
      z.on('pointerover', () => this.focus(i))
      z.on('pointerdown', (p) => { armed = p.button === 0 ? it : null })
      z.on('pointerup', (p) => { if (armed === it && !this.off) it.click ? it.click(p) : this.act('ok') })
      layer.add(z)
    })
    scene.input.on('pointerup', () => { armed = null }) // runs after the item's own pointerup
    this.focus(0, true)
  }

  focus(i, quiet) {
    if (i === this.i && !quiet) return
    this.i = i
    this.items.forEach((o, k) => o.parts.forEach(p => p.setAlpha(k === i ? 1 : 0.45)))
    const it = this.items[i], x = it.x - it.w / 2, y = it.y - it.h / 2
    this.frame.clear()
      .fillStyle(COLORS.player, 0.1).fillRoundedRect(x, y, it.w, it.h, 12)
      .lineStyle(8, COLORS.player, 0.1).strokeRoundedRect(x, y, it.w, it.h, 12)
      .lineStyle(2, COLORS.player, 0.9).strokeRoundedRect(x, y, it.w, it.h, 12)
    if (!quiet) SFX.play('uiMove')
  }

  act(a) {
    if (this.off) return
    const it = this.items[this.i], n = this.items.length, d = a === 'up' || a === 'left' ? -1 : 1
    if (a === 'up' || a === 'down') this.focus((this.i + d + n) % n)
    else if (a === 'left' || a === 'right') { if (it.adjust) it.adjust(d); else if (this.across) this.focus((this.i + d + n) % n) }
    else if (a === 'ok') { SFX.play('uiSelect'); it.pick() }
    else if (a === 'back' && this.back) { SFX.play('uiBack'); this.back() }
  }

  pad() { for (const b in UI_PAD) if (Pad.hit(b)) return this.act(UI_PAD[b]) }
}

// Settings overlay (title screen and pause menu): volume bars in 10% steps and on/off switches, applied at once and
// saved. Every row is a 0..n slider: left / right step it, Enter or a click cycles it, a click on a bar sets it.
// under: the menu to hide meanwhile. sync() (every frame while open) also shows F / fullscreen changes made elsewhere.
function uiSettings(scene, under) {
  const { w } = CONFIG.arena, cx = w / 2, top = 150
  const layer = uiPanel(scene, 'setTitle')
  const vol = (k) => ({ n: 10, get: () => Math.round(Settings[k] * 10), set: (v) => { Settings[k] = v / 10 } })
  const flag = (k) => ({ n: 1, get: () => +!!Settings[k], set: (v) => { Settings[k] = !!v } })
  // browsers allow fullscreen only right after a key press or click: a pad button alone can't
  const full = { n: 1, get: () => +scene.scale.isFullscreen, set: () => { if (navigator.userActivation?.isActive !== false) scene.scale.toggleFullscreen() } }
  const rows = [['music', vol('music')], ['sfx', vol('sfx')], ['shake', flag('shake')], ['flash', flag('flash')],
    ['autofire', flag('autofire')], ['fpsRow', flag('fps')], ['fullscreen', full]]
  const X0 = cx - 320, X1 = cx + 320, BAR = X1 - 245 // volume bar: 10 segments of 20 px, 5 px apart
  const change = (r, v) => {
    v = Phaser.Math.Clamp(v, 0, r.n)
    if (v === r.get()) return false
    r.set(v)
    Settings.save()
    sync()
    return true
  }
  const items = rows.map(([id, r], i) => {
    const y = top + 140 + i * 56, parts = [uiText(scene, X0 + 18, y, id)]
    if (r.n > 1) {
      r.segs = Array.from({ length: r.n }, (_, k) => scene.add.rectangle(BAR + k * 25 + 10, y, 20, 12, COLORS.player))
      parts.push(...r.segs)
    } else {
      r.sw = scene.add.image(X1 - 44, y, 'uiSwOff')
      r.on = uiText(scene, X1 - 88, y, 'on')
      r.off = uiText(scene, X1 - 88, y, 'off')
      parts.push(r.sw, r.on, r.off)
    }
    layer.add(parts)
    return { x: cx, y, w: 680, h: 48, parts, r,
      pick: () => change(r, (r.get() + 1) % (r.n + 1)),
      adjust: (d) => { if (change(r, r.get() + d)) SFX.play('uiMove') },
      click: (p) => {
        SFX.play('uiSelect')
        change(r, r.n > 1 && p.x > BAR - 20 ? Math.floor((p.x - BAR) / 25) + 1 : (r.get() + 1) % (r.n + 1))
      },
    }
  })
  const back = uiText(scene, cx, top + 553, 'back')
  const hints = [uiText(scene, cx, top + 603, 'setKeys'), uiText(scene, cx, top + 603, 'setPad')]
  layer.add([back, ...hints])
  const ui = {
    layer,
    open() { under.setVisible(false); layer.setVisible(true); ui.menu.focus(0, true); sync() },
    close() { layer.setVisible(false); under.setVisible(true) },
    sync,
  }
  items.push({ x: cx, y: top + 553, w: 220, h: 50, parts: [back], pick: ui.close })
  ui.menu = new UiMenu(scene, layer, items, ui.close)
  function sync() {
    for (const { r } of items) {
      const v = r && r.get()
      if (!r || v === r.shown) continue
      r.shown = v
      if (r.segs) r.segs.forEach((s, k) => s.setFillStyle(k < v ? COLORS.player : 0xffffff, k < v ? 1 : 0.12))
      else { r.sw.setTexture(v ? 'uiSwOn' : 'uiSwOff'); r.on.setVisible(!!v); r.off.setVisible(!v) }
    }
    uiShowFor(hints)
  }
  return ui
}

// Overlay panel (settings, hangar): dimmed screen, a framed box and its title, in a hidden layer.
function uiPanel(scene, titleId) {
  const { w, h } = CONFIG.arena, cx = w / 2, top = 150
  return scene.add.container(0, 0).setDepth(20).setVisible(false).add([
    scene.add.rectangle(cx, h / 2, w, h, COLORS.bg, 0.7),
    scene.add.graphics().fillStyle(0x060a16, 0.94).fillRoundedRect(cx - 370, top, 740, 630, 20)
      .lineStyle(8, COLORS.player, 0.08).strokeRoundedRect(cx - 370, top, 740, 630, 20)
      .lineStyle(2, COLORS.player, 0.55).strokeRoundedRect(cx - 370, top, 740, 630, 20),
    uiText(scene, cx, top + 62, titleId),
  ])
}

// Hangar overlay (title screen): the ship and its color, saved as they change. A locked color can be looked at, with
// what unlocks it, but not flown. The ship art follows what is shown (FX.paintShip). under: the menu to hide meanwhile.
function uiHangar(scene, under) {
  const { w } = CONFIG.arena, cx = w / 2, top = 150, X0 = cx - 320
  const layer = uiPanel(scene, 'hangarTitle')
  layer.add(scene.add.image(cx, top + 175, 'player').setRotation(-Math.PI / 2))
  const shown = {} // option index on show, per row
  const rows = [
    ['ship', 'shipRow', CONFIG.ships.map(s => [s.name, s.desc, '#8fb4d9'])],
    ['color', 'colorRow', CONFIG.colors.map(c => Unlocks.has(c.unlock) ? [c.name, 'UNLOCKED', '#8fb4d9']
      : [c.name, 'LOCKED  ·  ' + c.goal, uiHex(COLORS.warning)])],
  ]
  const picks = rows.map(([k, cap, opts], i) => {
    const y = top + 300 + i * 115, parts = [uiText(scene, X0 + 18, y, cap)]
    const vals = opts.map(([name, sub, color]) => [
      uiLabel(scene, cx + 130, y, `‹     ${name}     ›`, 26, '#e6fdff', { blur: 0, spacing: 6, weight: '900' }),
      uiLabel(scene, cx, y + 44, sub, 14, color, { blur: 0, spacing: 3, align: 'center', lineSpacing: 6 })])
    parts.push(...vals.flat())
    layer.add(parts)
    const step = (d) => { shown[k] = (shown[k] + d + opts.length) % opts.length; show() }
    return { x: cx, y: y + 22, w: 680, h: 100, parts, vals, k, pick: () => step(1),
      adjust: (d) => { step(d); SFX.play('uiMove') },
      click: (p) => { SFX.play('uiSelect'); step(p.x < cx + 130 ? -1 : 1) } }
  })
  const back = uiText(scene, cx, top + 553, 'back')
  const hints = [uiText(scene, cx, top + 603, 'hangarKeys'), uiText(scene, cx, top + 603, 'hangarPad')]
  layer.add([back, ...hints])
  function show() {
    for (const it of picks) it.vals.forEach((pair, n) => pair.forEach(o => o.setVisible(n === shown[it.k])))
    const color = CONFIG.colors[shown.color]
    Settings.ship = shown.ship
    if (Unlocks.has(color.unlock)) Settings.color = shown.color
    Settings.save()
    FX.paintShip(scene, CONFIG.ships[shown.ship], color.color)
  }
  const ui = {
    layer,
    open() {
      Object.assign(shown, { ship: CONFIG.ships[Settings.ship] ? Settings.ship : 0, color: Ship.colorIndex })
      show()
      under.setVisible(false)
      layer.setVisible(true)
      ui.menu.focus(0, true)
    },
    close() { layer.setVisible(false); under.setVisible(true); FX.paintShip(scene) }, // a locked color stays a preview
    sync: () => uiShowFor(hints),
  }
  ui.menu = new UiMenu(scene, layer, [...picks, { x: cx, y: top + 553, w: 220, h: 50, parts: [back], pick: ui.close }], ui.close)
  return ui
}

// Owned upgrades as a row of icons, a count after stacked ones. align: 1 = the row ends at x, 0.5 = centered on x.
function uiUpgradeIcons(scene, owned, x, y, align, scale) {
  const n = {}, out = []
  for (const id of owned || []) if (scene.textures.exists('up_' + id)) n[id] = (n[id] || 0) + 1
  let end = 0
  for (const id in n) {
    out.push(scene.add.image(end + 31 * scale, y, 'up_' + id).setScale(scale)) // 80 px icons: a 50 px frame + glow
    end += 58 * scale
    if (n[id] > 1) {
      const c = uiNum(scene, end - 6 * scale, y + 18 * scale, 'numW', 28 * scale).setText('x' + n[id])
      out.push(c)
      end += c.width - 2 * scale
    }
    end += 10 * scale
  }
  const dx = x - align * (end - 10 * scale)
  for (const o of out) o.x += dx
  return out
}

// A finished (or abandoned) run goes into the local top 5 (not a daily one: that has its own best) and the lifetime totals.
// Returns the table and this run's place in it (-1: didn't make it).
function uiRecordRun(d) {
  const run = { score: d.score, sector: d.sector, time: Math.floor(d.elapsed), date: Date.now() }
  const old = Store.get('runs', []), life = Store.get('lifetime', {}) || {}
  let runs = Array.isArray(old) ? old : []
  if (!d.daily) Store.set('runs', runs = runs.concat(run).sort((a, b) => b.score - a.score).slice(0, 5))
  Store.set('lifetime', { runs: (life.runs || 0) + 1, kills: (life.kills || 0) + d.kills, time: (life.time || 0) + d.elapsed,
    bosses: (life.bosses || 0) + (d.bosses || 0), bestSector: Math.max(life.bestSector || 0, d.sector) })
  return { runs, rank: runs.indexOf(run) }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('title') }

  create() {
    const { w, h } = CONFIG.arena
    const cx = w / 2
    Space.create(this, 1)
    this.focus = { x: cx, y: h / 2 }
    this.input.on('pointermove', p => { this.focus = p })
    this.leaving = false

    // drifting enemy silhouettes
    const kinds = ['wanderer', 'chaser', 'dodger', 'splitter', 'spinner', 'darter', 'brute', 'gunner']
    this.drifters = []
    for (let i = 0; i < 16; i++) {
      const d = this.add.image(Math.random() * w, Math.random() * h, kinds[i % kinds.length])
        .setScale(Phaser.Math.FloatBetween(0.8, 1.6)).setAlpha(Phaser.Math.FloatBetween(0.2, 0.4))
        .setBlendMode(Phaser.BlendModes.ADD)
      const a = Math.random() * Math.PI * 2, v = Phaser.Math.FloatBetween(12, 40)
      d.vx = Math.cos(a) * v
      d.vy = Math.sin(a) * v
      d.spin = Phaser.Math.FloatBetween(-1.2, 1.2)
      this.drifters.push(d)
    }

    // Title: two-tone neon words with a pulsing halo behind them.
    const halo = this.add.image(cx, 140, 'glow').setDisplaySize(1500, 440).setTint(COLORS.player)
      .setAlpha(0.1).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: halo, alpha: 0.2, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    const word = (str, core, color) => uiLabel(this, 0, 0, str, 150, core, { glow: color, blur: 30, weight: '900', stroke: 5, originX: 0 })
    const nova = word('NOVA', '#e6fdff', UI_CYAN)
    const rush = word('RUSH', '#ffe6fc', uiHex(COLORS.spinner))
    const pad = 34, gap = 44 // pad = glow padding (blur 30 + 4) on each side of a word texture
    const total = nova.width + rush.width - 4 * pad + gap
    nova.x = -total / 2 - pad
    rush.x = nova.x + nova.width - 2 * pad + gap
    const title = this.add.container(cx, 140, [nova, rush])
    this.tweens.add({ targets: [nova, rush], alpha: { from: 0, to: 1 }, duration: 900, ease: uiFlickerEase })
    this.tweens.add({ targets: title, scale: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.time.addEvent({
      delay: 2300, loop: true,
      callback: () => this.tweens.add({
        targets: Math.random() < 0.5 ? nova : rush, alpha: 0.3, duration: 40, yoyo: true, repeat: Phaser.Math.Between(1, 3),
      }),
    })

    uiLabel(this, cx, 240, 'The swarm never stops. A mothership guards every sector.\nDestroy it to warp deeper, and grab the power-ups the wrecks leave behind.',
      21, '#a9c8ea', { blur: 0, align: 'center', lineSpacing: 8, weight: '500' })

    this.ship = uiShowShip(this, cx, 330, 0.5)
    this.tweens.add({ targets: this.ship, y: 322, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' })

    // Menu: PLAY (focused), DAILY CHALLENGE (today's best beside it), HANGAR and SETTINGS; an open panel hides it.
    this.root = this.add.container(0, 0)
    const play = uiLabel(this, cx, 440, 'PLAY', 48, '#e6fdff', { glow: UI_CYAN, blur: 20, spacing: 16, weight: '900' })
    const daily = uiText(this, cx, 508, 'daily'), hangar = uiText(this, cx, 556, 'hangar'), set = uiText(this, cx, 604, 'settings')
    this.root.add([play, daily, hangar, set])
    const today = Daily.best(Daily.today())
    if (today) this.root.add(uiLabel(this, cx + 262, 508, 'TODAY  ' + uiFmt(today), 13, uiHex(COLORS.accent), { blur: 0, spacing: 3, originX: 0 }))
    this.menu = new UiMenu(this, this.root, [
      { x: cx, y: 440, w: 330, h: 78, parts: [play], pick: () => this.play(false) },
      { x: cx, y: 508, w: 500, h: 48, parts: [daily], pick: () => this.play(true) },
      { x: cx, y: 556, w: 290, h: 48, parts: [hangar], pick: () => this.hangar.open() },
      { x: cx, y: 604, w: 290, h: 48, parts: [set], pick: () => this.settings.open() },
    ])
    this.settings = uiSettings(this, this.root)
    this.hangar = uiHangar(this, this.root)

    // Controls as key chips in one centered row (a caption under each); a gamepad in use gets its own row.
    const chipRow = (controls) => {
      const y = 676, row = this.add.container(0, 0), box = this.add.graphics().lineStyle(2, COLORS.player, 0.55).fillStyle(COLORS.player, 0.07)
      row.add(box)
      const chips = controls.map(([key, cap]) => {
        const k = uiLabel(this, 0, y, key, 17, '#e8f7ff', { blur: 0 }), c = uiLabel(this, 0, y + 44, cap, 13, '#6f93bd', { blur: 0, spacing: 4 })
        row.add([k, c])
        const bw = k.width - 8 + 22 // label textures carry 4px padding per side
        return { k, c, bw, slot: Math.max(bw, c.width - 8 + 12) }
      })
      let x = cx - (chips.reduce((s, c) => s + c.slot, 0) + 18 * (chips.length - 1)) / 2
      for (const { k, c, bw, slot } of chips) {
        k.x = c.x = x + slot / 2
        box.fillRoundedRect(k.x - bw / 2, y - 23, bw, 46, 10).strokeRoundedRect(k.x - bw / 2, y - 23, bw, 46, 10)
        x += slot + 18
      }
      return row
    }
    this.chips = [
      chipRow([['WASD / ARROWS', 'MOVE'], ['MOUSE', 'AIM'], ['HOLD LEFT CLICK', 'FIRE'], ['SHIFT', 'DASH'],
        ['SPACE / RIGHT CLICK', 'BOMB'], ['T', 'AUTO-FIRE'], ['P / ESC', 'PAUSE']]), // M: bottom-right "SOUND ON [M]"
      chipRow([['LEFT STICK', 'MOVE'], ['RIGHT STICK', 'AIM + FIRE'], ['LB / LT / A', 'DASH'], ['RB / B', 'BOMB'], ['START', 'PAUSE']]),
      chipRow([['LEFT THUMB', 'MOVE'], ['RIGHT THUMB', 'AIM + FIRE'], ['DASH', 'DASH'], ['BOMB', 'BOMB'], ['II', 'PAUSE']]),
    ]
    this.padHint = [uiLabel(this, cx, 756, 'GAMEPAD SUPPORTED', 13, '#6f93bd', { blur: 0, spacing: 5 }),
      uiLabel(this, cx, 756, 'GAMEPAD CONNECTED', 13, '#e6fdff', { glow: UI_CYAN, blur: 8, spacing: 5 })]

    // Best score, then lifetime totals as caption + number pairs in one centered row.
    uiLabel(this, cx - 12, 796, 'BEST', 28, uiHex(COLORS.accent), { blur: 12, originX: 1 })
    uiNum(this, cx + 8, 796, 'numY', 28).setText(uiFmt(Store.get('best', 0)))
    const life = Store.get('lifetime', {}) || {}
    if (life.runs) {
      const pairs = [['RUNS', uiFmt(life.runs)], ['KILLS', uiFmt(life.kills || 0)], ['MOTHERSHIPS', uiFmt(life.bosses || 0)],
        ['BEST SECTOR', String(life.bestSector || 1)], ['TIME PLAYED', uiTime(life.time || 0)]]
        .map(([cap, v]) => [uiLabel(this, 0, 834, cap, 12, '#6f93bd', { blur: 0, spacing: 4, originX: 0 }), uiNum(this, 0, 834, 'numW', 19).setText(v)])
      const wide = ([c, n]) => c.width - 8 + 10 + n.width
      let x = cx - (pairs.reduce((s, p) => s + wide(p), 0) + 40 * (pairs.length - 1)) / 2
      for (const p of pairs) {
        p[0].x = x - p[0].pad
        p[1].x = x + p[0].width - 8 + 10
        x += wide(p) + 40
      }
    }

    if (CONFIG.low) {
      uiLabel(this, cx, 870, 'Graphics acceleration is off in this browser, so the game runs in low-detail mode. Turn it on in the browser settings for smooth play.',
        15, uiHex(COLORS.warning), { blur: 0 })
    }
    const mute = (on) => uiLabel(this, w - 28, h - 26, on ? 'SOUND ON  [M]' : 'SOUND OFF  [M]', 14, '#6f93bd', { blur: 0, spacing: 3, originX: 1 })
    this.soundOn = mute(true)
    this.soundOff = mute(false)
    uiLabel(this, 28, h - 26, 'FPS COUNTER  [F]', 14, '#6f93bd', { blur: 0, spacing: 3, originX: 0 })

    uiKeys(this, (code) => { if (UI_KEYS[code]) this.activeMenu().act(UI_KEYS[code]) })

    // Pre-paint every in-game label, one per frame, so no glow text is ever built during play.
    this.jobs = Object.keys(UI_TEXT).map(id => () => uiText(this, -999, -999, id).destroy())
    for (let n = 1; n <= 9; n++) {
      this.jobs.push(() => uiSectorName(this, -999, -999, n).destroy())
      if (n > 1) this.jobs.push(() => uiSectorText(this, n).destroy(), () => uiSectorSub(this, n).destroy())
    }
  }

  activeMenu() { return this.settings.layer.visible ? this.settings.menu : this.hangar.layer.visible ? this.hangar.menu : this.menu }

  play(daily) {
    if (this.leaving) return
    this.leaving = true
    if (Pad.touch && !this.scale.isFullscreen) this.scale.startFullscreen() // phones: the whole screen (main.js turns it sideways)
    while (this.jobs.length) this.jobs.shift()() // whatever isn't painted yet: now, not mid-game
    this.scene.start('game', { daily })
  }

  update(time, delta) {
    const { w, h } = CONFIG.arena
    const dt = Math.min(delta / 1000, 0.05)
    if (this.jobs.length) this.jobs.shift()()
    Space.update(this, dt, this.focus.x, this.focus.y)
    for (const d of this.drifters) {
      d.x = Phaser.Math.Wrap(d.x + d.vx * dt, -60, w + 60)
      d.y = Phaser.Math.Wrap(d.y + d.vy * dt, -60, h + 60)
      d.rotation += d.spin * dt
    }
    this.ship.flicker()
    this.soundOn.setVisible(!SFX.muted)
    this.soundOff.setVisible(SFX.muted)
    uiShowFor(this.chips)
    this.padHint[0].setVisible(!Pad.connected)
    this.padHint[1].setVisible(Pad.connected)

    const set = this.settings.layer.visible, hangar = this.hangar.layer.visible
    if (set) this.settings.sync()
    if (hangar) this.hangar.sync()
    if (!set && !hangar && Pad.hit('start')) this.play(false)
    else this.activeMenu().pad()
  }
}

// First-run tutorial: [keyboard hint, pad hint, touch hint, done(stats, step), seconds before it moves on anyway]
const UI_TUTOR = [
  ['tMove', 'tMovePad', 'tMoveTouch', (s, t) => t.dist > 350, 30],
  ['tFire', 'tFirePad', 'tFireTouch', (s, t) => s.shots - t.shots >= 12, 30],
  ['tDash', 'tDashPad', 'tDashTouch', (s, t) => s.dashes > t.dashes, 20],
  ['tBomb', 'tBombPad', 'tBombTouch', (s, t) => s.bombsUsed > t.bombs, 6],
]

class HudScene extends Phaser.Scene {
  constructor() { super('hud') }

  create() {
    const { w, h } = CONFIG.arena
    const g = this.g = this.scene.get('game')
    this.lastMult = 1
    this.fpsT = 0
    this.hb = 0        // s until the next last-life heartbeat
    this.shown = {}    // numbers on screen: their bitmap text is rebuilt only when they change

    // Top-left: score, multiplier, streak progress, best.
    uiText(this, 32, 24, 'score')
    this.scoreText = uiNum(this, 32, 58, 'numW', 40)
    this.multText = uiNum(this, 0, 60, 'numY', 32)
    this.add.rectangle(32, 90, 220, 3, 0xffffff, 0.12).setOrigin(0, 0.5)
    this.streakBar = this.add.rectangle(32, 90, 220, 3, COLORS.accent).setOrigin(0, 0.5)
    const best = uiText(this, 32, 110, g.daily ? 'dailyBest' : 'best').setAlpha(0.75)
    this.bestText = uiNum(this, 32 + best.width - 2 * best.pad + 10, 110, 'numY', 15).setAlpha(0.75)

    // Top-center: time survived, time left until the mothership, sector (and its twist), mothership health.
    this.timeText = uiNum(this, w / 2, 40, 'numW', 28, 0.5)
    this.toBossFill = this.add.rectangle(-85, 0, 170, 4, COLORS.boss).setOrigin(0, 0.5)
    this.toBossIcon = this.add.image(100, 0, 'boss').setScale(0.11)
    this.toBoss = this.add.container(w / 2, 59, [this.add.rectangle(0, 0, 170, 4, 0xffffff, 0.14), this.toBossFill, this.toBossIcon])
    this.sectorName = this.twistTag = null
    this.showSector(g.sector)
    this.bossFill = this.add.rectangle(-210, 22, 420, 8, COLORS.boss).setOrigin(0, 0.5)
    this.bossUi = this.add.container(w / 2, 118, [
      uiText(this, 0, 0, 'mothership'),
      this.add.rectangle(0, 22, 420, 8, 0xffffff, 0.12),
      this.bossFill,
    ]).setVisible(false)

    // Top-right: lives and bombs, right-aligned rows (toasts show under them).
    const row = (key, y) => {
      const icons = []
      for (let i = 0; i < CONFIG.hud.maxIcons; i++) {
        const icon = this.add.image(0, y, key).setVisible(false)
        icon.x = w - 32 - icon.width / 2 - i * (icon.width + 8)
        icons.push(icon)
      }
      const last = icons[CONFIG.hud.maxIcons - 1]
      icons.more = uiNum(this, last.x - last.width / 2 - 10, y, 'numW', 18, 1)
      return icons
    }
    this.lifeIcons = row('lifeIcon', 40)
    this.bombIcons = row('bombIcon', 80)
    this.toast = null

    // Bottom-left: active power-ups with their remaining time.
    this.powerUi = ['rapid', 'spread', 'shield'].map(type => {
      const c = this.add.container(0, 0, [this.add.image(0, 0, 'pu_' + type).setScale(0.9)]).setVisible(false)
      if (type !== 'shield') {
        c.bar = this.add.rectangle(24, 0, 110, 6, COLORS[type]).setOrigin(0, 0.5)
        c.add([this.add.rectangle(24, 0, 110, 6, 0xffffff, 0.12).setOrigin(0, 0.5), c.bar])
      }
      c.type = type
      return c
    })

    // Bottom-right: owned upgrades, with the FPS counter and MUTED above them.
    this.muteText = uiText(this, w - 28, h - 26, 'muted')
    this.fpsLabel = uiText(this, w - 76, h - 56, 'fps')
    this.fpsText = uiNum(this, w - 28, h - 56, 'numW', 18, 1)
    this.upIcons = []
    this.onUpgrade()

    // Score popups where enemies die: a small pool, the oldest reused first.
    this.pops = []
    for (let i = 0; i < 24; i++) this.pops.push(this.add.bitmapText(0, 0, 'numW', '').setOrigin(0.5).setVisible(false))
    this.popI = 0
    this.nearMiss = uiText(this, 0, 0, 'nearMiss').setVisible(false) // one tag, restarted by each near miss

    // Last life: red screen edges pulsing with a heartbeat (a plain border in low-detail mode).
    this.danger = (CONFIG.low ? this.add.rectangle(w / 2, h / 2, w - 8, h - 8).setStrokeStyle(8, COLORS.warning)
      : this.add.image(w / 2, h / 2, 'uiVignette').setDisplaySize(w, h).setTint(COLORS.warning).setBlendMode(Phaser.BlendModes.ADD))
      .setDepth(-1).setVisible(false)

    this.tut = Store.get('tutorial', false) ? null : { step: -1, age: -1.5 }
    this.createPause()
    uiKeys(this, (code) => this.key(code))
    this.events.once('shutdown', () => Pad.showTouch(false))

    const events = { swarm: this.onSwarm, extralife: this.onExtraLife, boss: this.onBoss, bossdown: this.onBossDown,
      sector: this.onSector, powerup: this.onPowerup, kill: this.onKill, toast: this.onToast, upgrade: this.onUpgrade,
      choosing: this.onChoosing, graze: this.onGraze, streak: this.onStreak }
    for (const [ev, fn] of Object.entries(events)) g.events.on(ev, fn, this)
    this.events.once('shutdown', () => { for (const [ev, fn] of Object.entries(events)) g.events.off(ev, fn, this) })
  }

  // Pause menu. The HUD keeps running while GameScene is paused, so it owns pausing and resuming.
  createPause() {
    const { w, h } = CONFIG.arena, cx = w / 2
    const paused = uiText(this, cx, 168, 'paused')
    this.tweens.add({ targets: paused, alpha: 0.6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.pauseKeys = [uiText(this, cx, h - 48, 'pauseKeys'), uiText(this, cx, h - 48, 'pausePad')]
    const pl = this.pauseLayer = this.add.container(0, 0, [this.add.rectangle(cx, h / 2, w, h, COLORS.bg, 0.78), paused, ...this.pauseKeys])
      .setDepth(10).setVisible(false)
    const acts = { resume: () => this.resume(), restart: () => this.leave('restartRun'),
      settings: () => this.settings.open(), quit: () => this.leave('quitToTitle') }
    this.pauseMenu = new UiMenu(this, pl, Object.keys(acts).map((id, i) => {
      const y = 350 + i * 64, img = uiText(this, cx, y, id)
      pl.add(img)
      return { x: cx, y, w: 400, h: 54, parts: [img], pick: acts[id] }
    }), () => this.resume())
    this.pauseOpen = false
    this.pauseInfo = [] // sector name + upgrade icons, rebuilt whenever the menu opens
    this.settings = uiSettings(this, pl) // hides the pause menu while open
  }

  showPause(on) {
    const g = this.g, cx = CONFIG.arena.w / 2
    this.pauseOpen = on
    this.settings.close()
    this.pauseLayer.setVisible(on)
    if (!on) return
    this.pauseInfo.forEach(o => o.destroy())
    this.pauseInfo = uiUpgradeIcons(this, g.upgrades, cx, 672, 0.5, 0.8)
    if (this.pauseInfo.length) this.pauseInfo.push(uiText(this, cx, 620, 'upgrades'))
    this.pauseInfo.push(uiSectorName(this, cx, 254, g.sector))
    this.pauseLayer.add(this.pauseInfo)
    this.pauseMenu.focus(0, true)
    this.tweens.add({ targets: this.pauseLayer, alpha: { from: 0, to: 1 }, duration: 150 })
  }

  pauseTarget() { return this.settings.layer.visible ? this.settings.menu : this.pauseMenu }

  // P / Esc pause; while paused they (and the menu keys) drive the pause menu. Nothing while choosing an upgrade.
  key(code) {
    const g = this.g
    if (g.state === 'playing') { if (code === 'KeyP' || code === 'Escape') g.togglePause(); return }
    if (g.state !== 'paused' || !this.pauseOpen) return // (the menu opens on the next update)
    if (code === 'KeyP') return this.pauseMenu.act('back')
    if (UI_KEYS[code]) this.pauseTarget().act(UI_KEYS[code])
  }

  resume() { if (this.g.state === 'paused') this.g.togglePause() }

  // Restart / quit from the pause menu: the run so far still counts toward the records.
  leave(method) {
    const g = this.g
    if (g.score > 0) uiRecordRun({ score: g.score, sector: g.sector, elapsed: g.elapsed, kills: g.kills, bosses: g.stats.bosses, daily: g.daily > 0 })
    g[method]()
  }

  update(time, delta) {
    const g = this.g, h = CONFIG.arena.h, cfg = CONFIG.score, shown = this.shown
    const dt = Math.min(delta / 1000, 0.05), playing = g.state === 'playing'
    this.cameras.main.setVisible(g.state !== 'gameover') // the game-over screen shows the final stats
    Pad.showTouch(playing && Pad.touch)

    if (shown.score !== g.score) {
      shown.score = g.score
      this.scoreText.setText(uiFmt(g.score))
      this.bestText.setText(uiFmt(Math.max(g.best, g.score)))
    }
    this.multText.x = this.scoreText.x + this.scoreText.width + 8
    const sec = Math.floor(g.elapsed)
    if (shown.sec !== sec) this.timeText.setText(uiTime(shown.sec = sec))

    const m = g.multiplier
    if (m !== this.lastMult) {
      this.multText.setText('x' + m)
      if (m > this.lastMult) this.popMultiplier()
      this.lastMult = m
    }
    if (!this.multText.text) this.multText.setText('x1')
    this.multText.setAlpha(m > 1 ? 1 : 0.45)
    this.streakBar.scaleX = m >= cfg.maxMult ? 1 : (g.streak % cfg.streakPerMult) / cfg.streakPerMult

    this.setIcons(this.lifeIcons, g.lives)
    this.setIcons(this.bombIcons, g.bombs)

    const b = g.boss
    this.bossUi.setVisible(!!b && b.telegraph <= 0)
    if (b) this.bossFill.scaleX = b.hp / b.hpMax
    this.toBoss.setVisible(!b && !(g.warping > 0))
    this.toBossFill.scaleX = Phaser.Math.Clamp((g.elapsed - g.sectorStart) / CONFIG.sector.duration, 0, 1)

    let k = 0
    for (const c of this.powerUi) {
      const left = c.type === 'shield' ? +g.shield : g.power[c.type] / (CONFIG.pickups.duration * (g.mods ? g.mods.duration : 1))
      c.setVisible(left > 0)
      if (left <= 0) continue
      c.setPosition(44, h - 40 - 44 * k++)
      if (c.bar) c.bar.scaleX = Math.min(1, left)
    }

    if (playing) this.updatePops(dt)
    this.updateDanger(dt, playing)
    if (this.tut) this.tutor(dt, playing)

    const paused = g.state === 'paused'
    if (paused !== this.pauseOpen) this.showPause(paused)
    else if (paused) {
      if (this.settings.layer.visible) this.settings.sync()
      if (Pad.hit('start')) this.pauseMenu.act('back')
      else this.pauseTarget().pad()
      uiShowFor(this.pauseKeys)
    } else if (playing && Pad.hit('start')) g.togglePause()

    this.muteText.setVisible(SFX.muted)
    this.fpsLabel.setVisible(Settings.fps)
    this.fpsText.setVisible(Settings.fps)
    if (Settings.fps && (this.fpsT -= delta) <= 0) {
      this.fpsT = 250
      this.fpsText.setText(String(Math.round(this.game.loop.actualFps)))
    }
  }

  setIcons(icons, n) {
    icons.forEach((icon, i) => {
      const on = i < n
      if (on && !icon.visible) this.tweens.add({ targets: icon, scale: { from: 2.2, to: 1 }, duration: 380, ease: 'Back.Out' })
      icon.setVisible(on)
    })
    icons.more.setText(n > CONFIG.hud.maxIcons ? '+' + (n - CONFIG.hud.maxIcons) : '')
  }

  // The sector's name and its twist (if any) under the timer; the mothership icon is the hull on its way.
  showSector(n) {
    const cx = CONFIG.arena.w / 2, i = this.g.twist.i
    if (this.sectorName) this.sectorName.destroy()
    if (this.twistTag) this.twistTag.destroy()
    this.sectorName = uiSectorName(this, cx, 76, n)
    this.twistTag = i >= 0 ? uiText(this, cx, 96, 'twistTag' + i) : null
    this.toBossIcon.setTexture(Enemies.design(n).tex)
  }

  popMultiplier() {
    const t = this.multText
    this.tweens.add({ targets: t, scale: { from: 1.8, to: 1 }, duration: 320, ease: 'Back.Out' })
    // expanding ghost of the new multiplier
    const ghost = uiNum(this, t.x, t.y, 'numY', 32).setText(t.text)
    this.tweens.add({ targets: ghost, scale: 2.6, alpha: 0, duration: 500, ease: 'Cubic.Out', onComplete: () => ghost.destroy() })
  }

  // Score popup where an enemy died: pooled; bigger and gold for big scores.
  onKill(x, y, points, kind) {
    const p = this.pops[this.popI++ % this.pops.length]
    const tier = kind === 'boss' ? 3 : points >= 1000 ? 2 : points >= 250 ? 1 : 0, key = tier ? 'numY' : 'numW', f = UI_NUM_FONTS[key]
    p.setFont(key, f.cw * [17, 22, 30, 56][tier] / f.size).setText('+' + uiFmt(points))
    p.y0 = y - 26
    p.setPosition(Phaser.Math.Clamp(x, 70, CONFIG.arena.w - 70), p.y0).setVisible(true).setAlpha(1)
    p.t = 0
    p.life = tier > 1 ? 1.4 : 0.8
  }

  onGraze(x, y, points) {
    this.onKill(x, y, points)
    const p = this.g.player, t = this.nearMiss
    this.tweens.killTweensOf(t)
    t.setPosition(p.x, p.y - 52).setVisible(true).setAlpha(1).setScale(1.3)
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' })
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 24, delay: 420, duration: 300, onComplete: () => t.setVisible(false) })
  }

  onStreak(tier) {
    const i = Math.min(tier, UI_STREAK.length - 1)
    this.banner(uiText(this, 0, 0, 'streak' + i), UI_STREAK[i][1], 620, tier === i ? uiText(this, 0, 78, 'streakSub' + i) : null)
    SFX.play('streak', { tier })
  }

  updatePops(dt) {
    for (const p of this.pops) {
      if (!p.visible) continue
      const k = (p.t += dt) / p.life
      if (k >= 1) { p.setVisible(false); continue }
      p.y = p.y0 - 46 * k * (2 - k)
      p.setAlpha(k < 0.6 ? 1 : 2.5 * (1 - k)).setScale(k < 0.1 ? 1.4 - 4 * k : 1)
    }
  }

  // Last life: the edges glow red in time with a lub-dub heartbeat every 1.2 s.
  updateDanger(dt, playing) {
    const g = this.g, on = g.lives === 1 && (playing || g.state === 'paused')
    this.danger.setVisible(on)
    if (!on) { this.hb = 0.8; return } // the first beat comes a moment after the life is lost
    if (!playing) return
    if ((this.hb -= dt) <= 0) { this.hb += 1.2; SFX.play('heartbeat') }
    const t = 1.2 - this.hb // s since the beat; the "dub" follows 0.22 s later
    this.danger.setAlpha(0.35 + 0.55 * Math.exp(-7 * t) + (t > 0.22 ? 0.4 * Math.exp(-7 * (t - 0.22)) : 0))
  }

  // First run only: one hint at a time at the bottom, each cleared by doing it (or after a while).
  tutor(dt, playing) {
    const t = this.tut, s = this.g.stats
    if (t.imgs) uiShowFor(t.imgs, playing)
    if (!playing || t.leaving || (t.age += dt) < 0) return
    if (t.step < 0) return this.tutorStep(0)
    const p = this.g.player
    t.dist += Math.hypot(p.vx, p.vy) * dt
    const [, , , done, max] = UI_TUTOR[t.step]
    const ok = done(s, t)
    if (!ok && t.age < max) return
    t.leaving = true
    if (ok) SFX.play('uiSelect')
    const old = t.imgs
    this.tweens.add({ targets: old, scale: ok ? 1.15 : 1, alpha: 0, duration: 450, ease: 'Cubic.Out', onComplete: () => {
      old.forEach(o => o.destroy())
      this.tutorStep(t.step + 1)
    } })
  }

  tutorStep(i) {
    const t = this.tut, s = this.g.stats, { w, h } = CONFIG.arena
    if (i >= UI_TUTOR.length) { Store.set('tutorial', true); this.tut = null; return }
    Object.assign(t, { step: i, age: 0, dist: 0, leaving: false, shots: s.shots, dashes: s.dashes, bombs: s.bombsUsed })
    t.imgs = UI_TUTOR[i].slice(0, 3).map(id => uiText(this, w / 2, h - 112, id).setAlpha(0))
    this.tweens.add({ targets: t.imgs, alpha: 1, duration: 300 })
  }

  // Big center banner: glowing text between two lines that sweep out, plus an optional subtitle image.
  banner(t, color, y, sub = null) {
    const lw = t.width - 56 // visible width: the texture carries 28px of glow padding per side
    const lines = [-48, 48].map((dy) => this.add.rectangle(0, dy, lw, 3, color).setScale(0, 1))
    const parts = [...lines, t]
    if (sub) parts.push(sub)
    const c = this.add.container(CONFIG.arena.w / 2, y, parts).setAlpha(0).setScale(1.5).setDepth(5)
    c.banner = true
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 260, ease: 'Cubic.Out' })
    this.tweens.add({ targets: lines, scaleX: 1, duration: 420, ease: 'Cubic.Out' })
    this.tweens.add({ targets: t, alpha: 0.35, duration: 70, yoyo: true, repeat: 3, delay: 300 })
    this.tweens.add({ targets: c, alpha: 0, y: y - 30, delay: 1900, duration: 450, onComplete: () => c.destroy() })
  }

  // the upgrade cards open over the arena: no half-faded banner behind them
  onChoosing() {
    for (const c of this.children.list.filter(o => o.banner)) { this.tweens.killTweensOf([c, ...c.list]); c.destroy() }
  }

  // red pulse around the screen edge (keeps the center clear)
  edgePulse(color) {
    const { w, h } = CONFIG.arena
    const edge = this.add.rectangle(w / 2, h / 2, w - 8, h - 8).setStrokeStyle(8, color).setAlpha(0)
    this.tweens.add({ targets: edge, alpha: 0.8, duration: 180, yoyo: true, repeat: 2, onComplete: () => edge.destroy() })
  }

  onSwarm() { this.banner(uiText(this, 0, 0, 'swarm'), COLORS.warning, 200); this.edgePulse(COLORS.warning) }
  onExtraLife() { this.banner(uiText(this, 0, 0, 'life'), COLORS.accent, 330) }
  onBoss() { this.banner(uiText(this, 0, 0, 'boss'), COLORS.boss, 220); this.edgePulse(COLORS.boss) }
  onBossDown() { this.banner(uiText(this, 0, 0, 'clear'), COLORS.accent, 250) }
  onSector(n) {
    const i = this.g.twist.i
    this.banner(uiSectorText(this, n), COLORS.player, 250, uiSectorSub(this, n))
    if (i >= 0) this.banner(uiText(this, 0, 0, 'twist' + i), COLORS.warning, 430)
    this.showSector(n)
  }

  onPowerup(type) {
    const t = uiText(this, CONFIG.arena.w / 2, CONFIG.arena.h - 170, type).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, y: t.y - 20, duration: 200, ease: 'Cubic.Out' })
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 50, delay: 900, duration: 400, onComplete: () => t.destroy() })
  }

  // Small notice under the lives / bombs (auto-fire, gamepad); a new one replaces the last.
  onToast(id) {
    if (!UI_TEXT[id]) return
    if (this.toast) { this.tweens.killTweensOf(this.toast); this.toast.destroy() }
    const t = this.toast = uiText(this, CONFIG.arena.w - 32, 124, id).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, x: { from: t.x + 40, to: t.x }, duration: 220, ease: 'Cubic.Out' })
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => { t.destroy(); if (this.toast === t) this.toast = null } })
    SFX.play('toast')
  }

  onUpgrade() {
    const { w, h } = CONFIG.arena
    this.upIcons.forEach(o => o.destroy())
    this.upIcons = uiUpgradeIcons(this, this.g.upgrades, w - 26, h - 36, 1, 0.6)
    const lift = this.upIcons.length ? 52 : 0
    this.muteText.y = h - 26 - lift
    this.fpsLabel.y = this.fpsText.y = h - 56 - lift
  }
}

class GameOverScene extends Phaser.Scene {
  constructor() { super('gameover') }

  create(data) {
    const { w, h } = CONFIG.arena, cx = w / 2, g = this.scene.get('game')
    const { runs, rank } = uiRecordRun(data)

    const dim = this.add.rectangle(cx, h / 2, w, h, COLORS.bg, 0.85).setAlpha(0)
    this.tweens.add({ targets: dim, alpha: 1, duration: 400 })

    const title = uiText(this, cx, 110, 'gameover')
    this.tweens.add({ targets: title, alpha: { from: 0, to: 1 }, duration: 700, ease: uiFlickerEase })
    this.tweens.add({ targets: title, scale: { from: 1.4, to: 1 }, duration: 600, ease: 'Cubic.Out' })

    uiText(this, cx, 212, 'goScore')
    const score = uiNum(this, cx, 270, 'numBig', 80, 0.5).setText('0')
    this.tweens.addCounter({
      from: 0, to: data.score, duration: 1300, delay: 250, ease: 'Cubic.Out',
      onUpdate: (tw) => score.setText(uiFmt(tw.getValue())),
      onComplete: () => data.newBest && this.newBest(cx, 350),
    })
    if (!data.newBest) {
      uiText(this, cx - 8, 348, data.daily ? 'goDailyBest' : 'goBest')
      uiNum(this, cx + 8, 348, 'numY', 26).setText(uiFmt(data.best))
    }

    // Two panels: this run's stats (left), the local top 5 with this run highlighted (right).
    const L = cx - 290, R = cx + 290, top = 404
    const frame = this.add.graphics().fillStyle(COLORS.player, 0.05).lineStyle(2, COLORS.player, 0.3)
    for (const x of [L, R]) frame.fillRoundedRect(x - 270, top, 540, 318, 16).strokeRoundedRect(x - 270, top, 540, 318, 16)
    uiText(this, L, top + 32, 'goRun')
    uiText(this, R, top + 32, 'goTop')
    const acc = data.shots > 0 ? Math.round(100 * data.hits / data.shots) : 0
    ;[['goTime', uiTime(data.elapsed)], ['goKills', uiFmt(data.kills)], ['goSector', String(data.sector)],
      ['goAcc', String(acc)], ['goMult', 'x' + (data.maxMult || 1)], ['goBoss', String(data.bosses || 0)]].forEach(([id, v], i) => {
      const x = L + (i % 3 - 1) * 175, y = top + 96 + Math.floor(i / 3) * 112
      uiText(this, x, y, id)
      const n = uiNum(this, x, y + 42, 'numW', 34, 0.5).setText(v)
      if (id === 'goAcc') { n.x -= 9; uiText(this, n.x + n.width / 2 + 2, y + 44, 'goPct') }
    })
    const cols = [R - 215, R - 70, R + 45, R + 135, R + 220] // rank, score, sector, time, date
    ;['lbScore', 'lbSector', 'lbTime', 'lbDate'].forEach((id, i) => uiText(this, cols[i + 1], top + 72, id))
    runs.forEach((r, i) => {
      const y = top + 110 + i * 40, mine = i === rank, font = mine ? 'numY' : 'numW'
      if (mine) this.add.graphics().fillStyle(COLORS.accent, 0.12).fillRoundedRect(R - 252, y - 17, 504, 34, 8)
        .lineStyle(1.5, COLORS.accent, 0.7).strokeRoundedRect(R - 252, y - 17, 504, 34, 8)
      ;[String(i + 1), uiFmt(r.score), String(r.sector), uiTime(r.time)].forEach((v, k) => uiNum(this, cols[k], y, font, 20, 0.5).setText(v))
      uiLabel(this, cols[4], y, uiDate(r.date), 13, mine ? uiHex(COLORS.accent) : '#8fb4d9', { blur: 0, spacing: 2 })
    })

    // PLAY AGAIN (Enter / Space / R / click anywhere / pad A or Start) and MENU (Esc / pad B).
    this.again = () => { if (this.ready) { this.ready = false; g.restartRun(); this.scene.stop() } }
    this.toMenu = () => { if (this.ready) { this.ready = false; g.quitToTitle(); this.scene.stop() } }
    const again = uiText(this, cx - 140, 792, 'again'), menu = uiText(this, cx + 170, 792, 'menu')
    const btns = this.add.container(0, 0, [again, menu]).setAlpha(0.3)
    this.menu = new UiMenu(this, btns, [
      { x: cx - 140, y: 792, w: 320, h: 62, parts: [again], pick: this.again },
      { x: cx + 170, y: 792, w: 190, h: 62, parts: [menu], pick: this.toMenu },
    ], this.toMenu, true)
    this.hints = [uiText(this, cx, 858, 'goKeys'), uiText(this, cx, 858, 'goPad')]

    // Ignore input briefly so a held fire button / panic click doesn't skip this screen.
    this.ready = false
    this.menu.off = true
    this.time.delayedCall(800, () => {
      this.ready = true
      this.menu.off = false
      this.tweens.add({ targets: btns, alpha: 1, duration: 250 })
    })
    uiKeys(this, (code) => {
      if (!this.ready) return
      if (code === 'KeyR') this.again()
      else if (UI_KEYS[code]) this.menu.act(UI_KEYS[code])
    })
    let armed = false // a click anywhere but on the buttons plays again
    this.input.on('pointerdown', (p) => { armed = this.ready && p.button === 0 })
    this.input.on('pointerup', (p, over) => { if (armed && !over.length) this.again(); armed = false })
  }

  update() {
    uiShowFor(this.hints)
    if (!this.ready) return
    if (Pad.hit('start')) this.again()
    else this.menu.pad()
  }

  newBest(x, y) {
    const t = uiText(this, x, y, 'newBest')
    this.tweens.add({ targets: t, scale: { from: 0, to: 1 }, duration: 520, ease: 'Back.Out' })
    this.tweens.add({ targets: t, scale: 1.08, duration: 600, delay: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.add.particles(x, y, 'dot', {
      speed: { min: 140, max: 560 }, lifespan: 1200, scale: { start: 1, end: 0 },
      tint: [COLORS.accent, COLORS.player, COLORS.spinner, 0xffffff], blendMode: 'ADD', emitting: false,
    }).explode(90)
    SFX.play('extraLife')
  }
}
