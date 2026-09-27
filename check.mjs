// NOVA RUSH end-to-end check: node check.mjs [--shots DIR] [--gpu]
// Headless Chrome over CDP: title -> play (bot) -> bomb -> power-up -> dash / auto-fire / gamepad -> mothership -> upgrade -> warp -> pause -> game over -> restart.
// Default renders in software (SwiftShader, the game's low-detail mode); --gpu uses the real GPU (full detail).
// Zero dependencies (Node 24 built-ins + google-chrome). Exit 0 = PASS, 1 = FAIL.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PAGE = 'file://' + path.join(import.meta.dirname, 'index.html')
const shotsArg = process.argv.indexOf('--shots')
const SHOTS = shotsArg > 0 ? process.argv[shotsArg + 1] : null
const G = `game.scene.getScene('game')` // page-side expression for the GameScene
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-check-'))
const chrome = spawn('google-chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  ...(process.argv.includes('--gpu') ? ['--use-angle=gl', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--window-size=1600,900',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore', detached: true }) // own process group, so all Chrome children die with it
chrome.on('error', (e) => fail('cannot launch google-chrome: ' + e.message))

let finished = false
async function finish(ok, msg) {
  if (finished) return
  finished = true
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`)
  try { process.kill(-chrome.pid, 'SIGKILL') } catch {}
  await Promise.race([new Promise((r) => chrome.once('exit', r)), sleep(2000)])
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  process.exit(ok ? 0 : 1)
}
const fail = (msg) => finish(false, msg)
setTimeout(() => fail('hard timeout (90s)'), 90000)

function check(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('PASS  ' + msg)
}

// --- CDP plumbing ---
let ws, nextId = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nextId
  pending.set(id, { res, rej, method })
  ws.send(JSON.stringify({ id, method, params }))
})
const describe = (d) => `${d.exception?.description ?? d.text} (${d.url ?? ''}:${d.lineNumber})`

function onEvent({ method, params }) {
  if (method === 'Runtime.exceptionThrown') fail('uncaught exception: ' + describe(params.exceptionDetails))
  else if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
    fail('console.error: ' + params.args.map((a) => a.value ?? a.description).join(' '))
  else if (method === 'Log.entryAdded' && params.entry.level === 'error')
    fail(`browser error: ${params.entry.text} ${params.entry.url ?? ''}`)
}

async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.exceptionDetails) throw new Error(`page threw on "${expression.slice(0, 80)}": ${describe(r.exceptionDetails)}`)
  return r.result.value
}

async function waitFor(expression, what, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await js(expression)) return
  throw new Error('timed out waiting for ' + what)
}

const KEYS = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyP: 80, KeyT: 84, Space: 32, Digit1: 49, ShiftLeft: 16 }
const key = (code, type) => send('Input.dispatchKeyEvent', {
  type, code, key: code === 'Space' ? ' ' : code === 'ShiftLeft' ? 'Shift' : code.slice(-1).toLowerCase(), windowsVirtualKeyCode: KEYS[code], // KeyW -> w, Digit1 -> 1
})
async function tap(code) { await key(code, 'keyDown'); await sleep(80); await key(code, 'keyUp') }
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 })
async function click(x, y) {
  await mouse('mouseMoved', x, y, 0)
  await mouse('mousePressed', x, y, 1)
  await sleep(60)
  await mouse('mouseReleased', x, y, 0)
}

async function shot(name) {
  if (!SHOTS) return
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'))
}

// Bot view: player, nearest active enemy, and the world->page transform of the (FIT-scaled) canvas.
const BOT_VIEW = `(() => {
  const g = ${G}, r = game.canvas.getBoundingClientRect(), k = r.width / CONFIG.arena.w
  let n = null, nd = 1e9
  for (const e of g.enemies) {
    const d = Math.hypot(e.x - g.player.x, e.y - g.player.y)
    if (e.telegraph <= 0 && d < nd) { nd = d; n = e }
  }
  return { state: g.state, elapsed: g.elapsed, count: g.enemies.length, px: g.player.x, py: g.player.y,
    tx: n ? n.x : CONFIG.arena.w / 2, ty: n ? n.y : CONFIG.arena.h / 2, nd, left: r.left, top: r.top, k }
})()`

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
  let port
  for (let i = 0; i < 150 && !port; i++) {
    try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch {}
    if (!port) await sleep(100)
  }
  if (!port) throw new Error('Chrome did not open a DevTools port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP websocket failed')) })
  ws.onclose = () => fail('Chrome closed the DevTools connection (crashed?)')
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data)
    if (!m.id) return onEvent(m)
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result)
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: PAGE })

  // Title -> game. (window.game is the <div id="game"> until main.js replaces it, hence ?.)
  await waitFor(`!!window.game?.scene?.isActive('title')`, 'title scene', 20000)
  await sleep(800)
  await shot('title')
  await click(800, 450)
  await waitFor(`game.scene.isActive('game') && ${G}.state === 'playing'`, 'game to start after click')
  check(true, 'title shown, click starts the game')

  // ~10s bot: flee the nearest enemy (drifting around the center otherwise), aim at it, hold fire.
  // Counted in game time (capped at 45s wall) so a slow software-GL frame rate still gets a real run.
  const start = await js(BOT_VIEW)
  const held = new Set()
  let s = start, maxCount = 0, moved = 0
  await mouse('mousePressed', 800, 450, 1)
  for (const end = Date.now() + 45000; Date.now() < end && s.state === 'playing' && s.elapsed - start.elapsed < 10; await sleep(100)) {
    s = await js(BOT_VIEW)
    maxCount = Math.max(maxCount, s.count)
    moved = Math.max(moved, Math.hypot(s.px - start.px, s.py - start.py))
    await mouse('mouseMoved', s.left + s.tx * s.k, s.top + s.ty * s.k, 1)
    let mx = (800 - s.px) / 400 + Math.cos(s.elapsed), my = (450 - s.py) / 300 + Math.sin(s.elapsed)
    if (s.nd < 320) { mx += ((s.px - s.tx) / s.nd) * 2; my += ((s.py - s.ty) / s.nd) * 2 }
    const want = [mx > 0.3 && 'KeyD', mx < -0.3 && 'KeyA', my > 0.3 && 'KeyS', my < -0.3 && 'KeyW'].filter(Boolean)
    for (const c of held) if (!want.includes(c)) { await key(c, 'keyUp'); held.delete(c) }
    for (const c of want) if (!held.has(c)) { await key(c, 'keyDown'); held.add(c) }
  }
  await shot('play')
  await mouse('mouseReleased', 800, 450, 0)
  for (const c of held) await key(c, 'keyUp')
  const run = await js(`(() => { const g = ${G}; return { state: g.state, score: g.score, kills: g.kills } })()`)
  check(run.state === 'playing', `still playing after the bot run (${s.elapsed.toFixed(1)}s game time, state: ${run.state})`)
  check(maxCount > 0, `enemies spawned (up to ${maxCount} alive)`)
  check(moved > 50, `player moves with WASD (${Math.round(moved)}px)`)
  check(run.score > 0, `shooting scores (score ${run.score}, kills ${run.kills})`)

  // Bomb: tag the live enemies, press Space, every tagged one must be gone.
  await waitFor(`${G}.enemies.length > 0`, 'enemies on screen to bomb', 15000)
  const bombs = await js(`(() => { const g = ${G}; g.enemies.forEach((e) => { e.__preBomb = true }); return g.bombs })()`)
  await tap('Space')
  await waitFor(`${G}.bombs < ${bombs}`, `Space to use a bomb (bombs ${bombs})`, 2000)
  await waitFor(`${G}.enemies.every((e) => !e.__preBomb)`, 'the bomb to clear every enemy', 1500)
  const left = await js(`${G}.bombs`)
  check(left === bombs - 1, `one bomb used (${bombs} -> ${left}) and every enemy cleared`)
  await sleep(150)
  await shot('bomb')

  // Power-up: one dropped next to the ship is pulled in and collected.
  await js(`(() => { const g = ${G}; Pickups.drop(g, g.player.x + 40, g.player.y, 'rapid', true); return true })()`)
  await waitFor(`${G}.power.rapid > 0`, 'the rapid-fire power-up to be collected', 3000)
  check(true, 'power-up collected (rapid fire active)')

  // Dash: Shift bursts the ship forward, untouchable, then a cooldown.
  const dashes = await js(`${G}.stats.dashes`)
  await tap('ShiftLeft')
  await waitFor(`${G}.stats.dashes === ${dashes + 1} && ${G}.dashCd > 0`, 'Shift to dash', 2000)
  check(true, 'Shift dashes (cooldown running)')

  // Auto-fire: T toggles it; it shoots with no mouse button held while enemies are around.
  await js(`(() => { const g = ${G}; const e = Enemies.spawn(g, 'wanderer', 1500, 100, 0); e.vx = e.vy = e.speed = 0; window.__shots = g.stats.shots; return true })()`)
  await tap('KeyT')
  await waitFor(`Settings.autofire && ${G}.stats.shots > window.__shots + 2`, 'T to turn on auto-fire', 3000)
  await tap('KeyT')
  await waitFor(`!Settings.autofire`, 'T to turn auto-fire off', 2000)
  check(true, 'T toggles auto-fire (fires with no button held)')

  // Gamepad (a faked standard pad): left stick moves, right stick aims + fires, RB bombs; unplugged, the mouse takes over.
  await js(`(() => { window.__pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    navigator.getGamepads = () => [window.__pad]; const g = ${G}; window.__padAt = [g.player.x, g.stats.shots, g.bombs]; return true })()`)
  await js(`(() => { window.__pad.axes = [-1, 0, 0, -1]; return true })()`)
  await sleep(500)
  const pad = await js(`(() => { const g = ${G}, [x, shots] = window.__padAt; return { moved: x - g.player.x, shots: g.stats.shots - shots, cursor: game.canvas.style.cursor } })()`)
  await js(`(() => { window.__pad.axes = [0, 0, 0, 0]; window.__pad.buttons[5] = { pressed: true, value: 1 }; return true })()`)
  await waitFor(`${G}.bombs === window.__padAt[2] - 1`, 'pad RB to bomb', 2000)
  await js(`(() => { window.__pad.connected = false; navigator.getGamepads = () => []; return true })()`)
  check(pad.moved > 50 && pad.shots > 2 && pad.cursor === 'none', `gamepad: stick moved ${Math.round(pad.moved)}px, right stick fired ${pad.shots}, RB bombed, cursor hidden`)

  // Touch: a tap switches to the on-screen controls; left thumb moves, right thumb aims (up) + fires, DASH / BOMB / pause
  // buttons work, a tap on RESUME closes the pause menu, and the mouse takes over again.
  const touch = (type, touchPoints = []) => send('Input.dispatchTouchEvent', { type, touchPoints })
  const btn = (b) => js(`(() => { const r = document.querySelector('[data-btn=${b}]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  const press = async ([x, y]) => { await touch('touchStart', [{ x, y }]); await sleep(60); await touch('touchEnd') }
  await js(`(() => { const g = ${G}; g.player.invuln = 30; g.player.x = 800; g.player.y = 450; g.bombs = 2; g.dashCd = 0; return true })()`)
  await press([800, 450])
  await waitFor(`Pad.touch && document.getElementById('touch').classList.contains('on')`, 'a tap to show the touch controls', 2000)
  const t0 = await js(`(() => { const g = ${G}; return { x: g.player.x, shots: g.stats.shots, dashes: g.stats.dashes, bombs: g.bombs } })()`)
  await touch('touchStart', [{ x: 300, y: 650, id: 1 }])
  await touch('touchStart', [{ x: 300, y: 650, id: 1 }, { x: 1300, y: 650, id: 2 }])
  await touch('touchMove', [{ x: 200, y: 650, id: 1 }, { x: 1300, y: 550, id: 2 }])
  await sleep(500)
  const t1 = await js(`(() => { const g = ${G}; return { x: g.player.x, shots: g.stats.shots, rot: g.player.rotation } })()`)
  await touch('touchEnd')
  await sleep(100)
  const idle = await js(`Pad.move.x === 0 && Pad.aim.x === 0 && Pad.aim.y === 0`)
  check(t0.x - t1.x > 50 && t1.shots - t0.shots > 2 && Math.abs(t1.rot + Math.PI / 2) < 0.2 && idle,
    `touch: left thumb moved ${Math.round(t0.x - t1.x)}px, right thumb aimed up and fired ${t1.shots - t0.shots}, both let go`)
  await press(await btn('lb'))
  await waitFor(`${G}.stats.dashes === ${t0.dashes + 1}`, 'the DASH button to dash', 2000)
  await press(await btn('rb'))
  await waitFor(`${G}.bombs === ${t0.bombs - 1}`, 'the BOMB button to bomb', 2000)
  await press(await btn('start'))
  await waitFor(`${G}.state === 'paused' && !document.getElementById('touch').classList.contains('on')`, 'the pause button to pause', 2000)
  await sleep(300)
  await press([800, 350]) // RESUME
  await waitFor(`${G}.state === 'playing'`, 'a tap on RESUME', 2000)
  await sleep(1100)
  await mouse('mouseMoved', 800, 450, 0)
  await waitFor(`!Pad.touch && !Pad.active && !document.getElementById('touch').classList.contains('on')`, 'the mouse to take over from touch', 2000)
  check(true, 'touch buttons: DASH dashes, BOMB bombs, II pauses, RESUME tapped; the mouse takes over again')

  // Mothership: skip to the end of sector 1, it arrives; destroy it, pick an upgrade, and the ship warps to sector 2.
  await js(`(() => { const g = ${G}; g.player.invuln = 60; g.sectorStart = g.elapsed - CONFIG.sector.duration; return true })()`)
  await waitFor(`!!${G}.boss && ${G}.boss.telegraph <= 0`, 'the mothership to arrive', 8000)
  await sleep(300)
  await shot('boss')
  const boss = await js(`(() => { const b = ${G}.boss; return { hp: b.hp, hpMax: b.hpMax } })()`)
  check(boss.hp > 1 && boss.hp <= boss.hpMax, `mothership arrived at the end of the sector (hp ${boss.hp}/${boss.hpMax})`)
  await js(`(() => { const g = ${G}, b = g.boss; b.hp = 2; g.hitEnemy(b); g.hitEnemy(b); return true })()`)
  await waitFor(`${G}.boss === null && ${G}.warping > 0`, 'two hits to destroy the mothership', 2000)
  check(true, 'armored hits bring the mothership down (sector clear)')
  await waitFor(`${G}.state === 'choosing' && game.scene.isActive('upgrade')`, 'the upgrade pick after the mothership', 6000)
  await waitFor(`game.scene.getScene('upgrade').ready`, 'the cards to take input (0.5 s guard)', 3000) // cards are in by then
  await shot('upgrade')
  const offer = await js(`game.scene.getScene('upgrade').cards.map((c) => c.u.id)`)
  await tap('Digit1')
  await waitFor(`${G}.state === 'playing' && ${G}.upgrades.includes('${offer[0]}') && !game.scene.isActive('upgrade')`,
    `key 1 to pick ${offer[0]} and resume`, 3000)
  check(new Set(offer).size === offer.length, `upgrade offer (${offer.join(', ')}): key 1 picks ${offer[0]}, play resumes`)
  await waitFor(`${G}._space.boost > 20`, 'the warp to start', 6000)
  await shot('warp')
  await waitFor(`${G}.sector === 2 && ${G}.warping <= 0`, 'the warp to reach sector 2', 12000)
  await sleep(1200)
  await shot('sector2')
  check(true, 'warped to sector 2')

  // Pause freezes time and enemies; P resumes.
  const frozen = `(() => { const g = ${G}; return g.state + '|' + g.elapsed + '|' + g.enemies.map((e) => e.x + ',' + e.y).join(';') })()`
  await tap('KeyP')
  await waitFor(`${G}.state === 'paused'`, 'P to pause', 2000)
  const before = await js(frozen)
  await sleep(1000)
  await shot('pause')
  check((await js(frozen)) === before, 'paused: elapsed and enemies frozen for 1s')
  const pausedAt = await js(`${G}.elapsed`)
  await tap('KeyP')
  await waitFor(`${G}.state === 'playing'`, 'P to resume', 2000)
  await sleep(500)
  check((await js(`${G}.elapsed`)) > pausedAt, 'P resumes: state playing, elapsed running')

  // Die until game over.
  for (let i = 0; i < 40 && (await js(`${G}.state`)) !== 'gameover'; i++) {
    await js(`${G}.state === 'playing' && ${G}.hitPlayer()`)
    await sleep(100)
  }
  const over = await js(`(() => { const g = ${G}; return { state: g.state, score: g.score, best: g.best } })()`)
  check(over.state === 'gameover', `hitPlayer() until game over (state: ${over.state})`)
  check(over.best >= over.score, `best >= score (${over.best} >= ${over.score})`)
  await waitFor(`game.scene.isActive('gameover')`, 'game over screen', 2000)
  await sleep(1000)
  await shot('gameover')

  // Click -> a completely fresh run.
  await click(800, 450)
  await waitFor(`game.scene.isActive('game') && ${G}.state === 'playing'`, 'click to restart', 5000)
  const fresh = await js(`(() => { const g = ${G}; return { score: g.score, lives: g.lives, bombs: g.bombs, sector: g.sector, boss: !!g.boss,
    pickups: g.pickups.length, enemies: g.enemies.length, over: game.scene.isActive('gameover'), okLives: CONFIG.player.lives, okBombs: CONFIG.player.bombs } })()`)
  check(fresh.score === 0 && fresh.lives === fresh.okLives && fresh.bombs === fresh.okBombs && fresh.enemies === 0 && !fresh.over &&
    fresh.sector === 1 && !fresh.boss && fresh.pickups === 0,
    `restart is a fresh run (score ${fresh.score}, lives ${fresh.lives}, bombs ${fresh.bombs}, sector ${fresh.sector}, enemies ${fresh.enemies})`)

  const music = await js(`({ error: Music.error, mood: Music.mood, notes: Object.values(Music.count).reduce((a, b) => a + b, 0), late: Music.late })`)
  check(music.error === null && music.notes > 0, `soundtrack ran without errors (${music.notes} notes, mood ${music.mood}, late steps ${music.late})`)
  console.log(`fps: ${Math.round(await js('game.loop.actualFps'))}`)
}

main().then(() => finish(true, 'all checks'), (e) => fail(e.message))
