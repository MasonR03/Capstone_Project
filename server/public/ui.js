// public/ui/ui.js
// Simple HUD (no minimap). Exposes a tiny API on window.UI
// - UI.init(scene)
// - UI.updateScores(scores)
// - UI.updateHpXp({hp, maxHp, xp, maxXp})
// - UI.tick(camera)  (call each frame so it stays in the corner)

(function () {
  let scene;
  let hpBg, hpFill, hpText;
  let xpBg, xpFill, xpText;
  let scoreText;

  function init(phaserScene) {
    // store scene ref
    scene = phaserScene;

    const cam = scene.cameras.main;
    const cx  = cam.width / 2;

    // HP bar
    hpBg   = scene.add
      .rectangle(cx, cam.height - 80, 220, 20, 0x222222)
      .setScrollFactor(0)
      .setDepth(100);

    hpFill = scene.add
      .rectangle(cx, cam.height - 80, 220, 20, 0xff3333)
      .setScrollFactor(0)
      .setDepth(101);

    hpText = scene.add
      .text(cx, cam.height - 80, 'HP 0/0', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(102);

    // XP bar
    xpBg   = scene.add
      .rectangle(cx, cam.height - 50, 220, 10, 0x222222)
      .setScrollFactor(0)
      .setDepth(100);

    xpFill = scene.add
      .rectangle(cx, cam.height - 50, 220, 10, 0x00ccff)
      .setScrollFactor(0)
      .setDepth(101);

    xpText = scene.add
      .text(cx, cam.height - 50, 'XP 0/0', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace'
      })
      .setOrigin(0.5, 1.6)
      .setScrollFactor(0)
      .setDepth(102);

    // Score (top-left)
    scoreText = scene.add
      .text(20, 20, 'Score: R 0 | B 0', {
        fontSize: '18px',
        fill: '#ffffff',
        fontFamily: 'monospace'
      })
      .setScrollFactor(0)
      .setDepth(100);

    return window.UI;
  }

  function updateScores(scores) {
    if (!scores || !scoreText) return;
    scoreText.setText(`Score: R ${scores.red || 0} | B ${scores.blue || 0}`);
  }

  function updateHpXp({ hp = 0, maxHp = 0, xp = 0, maxXp = 0 } = {}) {
    // HP
    if (hpFill && maxHp > 0) {
      const p = Math.max(0, Math.min(1, hp / maxHp));
      hpFill.width = 220 * p;
      if (hpText) hpText.setText(`HP ${Math.max(0, Math.floor(hp))}/${maxHp}`);
    }
    // XP
    if (xpFill && maxXp > 0) {
      const p = Math.max(0, Math.min(1, xp / maxXp));
      xpFill.width = 220 * p;
      if (xpText) xpText.setText(`XP ${Math.max(0, Math.floor(xp))}/${maxXp}`);
    }
  }

  // keep UI anchored if the camera size changes / resizes
  function tick(camera) {
    if (!camera) return;
    const cx = camera.width / 2;

    if (hpBg)   hpBg.setPosition(cx, camera.height - 80);
    if (hpFill) hpFill.setPosition(cx, camera.height - 80);
    if (hpText) hpText.setPosition(cx, camera.height - 80);

    if (xpBg)   xpBg.setPosition(cx, camera.height - 50);
    if (xpFill) xpFill.setPosition(cx, camera.height - 50);
    if (xpText) xpText.setPosition(cx, camera.height - 50);
  }

  window.UI = { init, updateScores, updateHpXp, tick };
})();
