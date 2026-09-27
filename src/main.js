// NOVA RUSH - boot scene + Phaser game config.

class BootScene extends Phaser.Scene {
  constructor() { super('boot') }

  create() {
    // Without GPU acceleration the browser draws WebGL in software (SwiftShader / llvmpipe) at a fraction of the
    // speed: detect it, trim the effects (CONFIG.low) and let the title screen say how to fix it.
    const gl = this.game.renderer.gl
    let renderer = ''
    try {
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
      renderer = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : ''
    } catch (e) {}
    CONFIG.low = !gl || /swiftshader|llvmpipe|softpipe|software/i.test(renderer)

    FX.makeTextures(this)
    Space.makeTextures(this)
    Upgrades.makeTextures(this)
    uiFonts(this)
    this.scene.start('title')
  }
}

// Going fullscreen turns a phone sideways too, where the browser allows it.
document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) screen.orientation?.lock?.('landscape').catch(() => {}) })

// right-click is the bomb: no context menu anywhere on the page (canvas or letterbox)
document.addEventListener('contextmenu', e => e.preventDefault())

window.game = new Phaser.Game({
  type: Phaser.AUTO,
  width: CONFIG.arena.w,
  height: CONFIG.arena.h,
  backgroundColor: COLORS.bg,
  parent: 'game',
  audio: { noAudio: true },   // SFX runs its own Web Audio graph
  // fullscreen: the whole page, so the touch controls (outside the canvas) come along
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: document.documentElement },
  scene: [BootScene, TitleScene, GameScene, HudScene, UpgradeScene, GameOverScene],
})
game.events.on('prestep', Pad.poll) // one gamepad read per frame, shared by every scene
