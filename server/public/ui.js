// public/ui/ui.js
// Simple HUD (no minimap)
// Exposes:
// - UI.init(scene)
// - UI.updateScores(scores)
// - UI.updateHpXp({ hp, maxHp, xp, maxXp })
// - UI.tick(camera)

(function () {
  console.log('LOADED UI.JS (public/ui/ui.js) v205');

  let scene;

  // HUD pieces
  let hud;
  let frameImg;
  let hpFill, xpFill;

  // Text
  let hpLabel, xpLabel;   // "HP" / "XP" in the gap
  let hpText, xpText;     // "100/100" centered on bar
  let scoreText;

  // ~~~~ layout tuning ~~~~
  const HUD_X = 16;
  const HUD_Y = 16;
  const HUD_SCALE = 1;

  // ~~~~ bar coords (HUD local px) ~~~~
  const HP_START_X = 45;
  const HP_CENTER_Y = 14;
  const HP_END_X = 128;

  const XP_START_X = 45;
  const XP_CENTER_Y = 48;
  const XP_END_X = 128;

  // ~~~~ padding inside the bar window ~~~~
  const FILL_PAD_L = 2;
  const FILL_PAD_R = 2;

  // Fill sizes (computed)
  const HP_FILL_X = HP_START_X + FILL_PAD_L;
  const HP_FILL_Y = HP_CENTER_Y;
  const HP_FILL_W = (HP_END_X - HP_START_X) - (FILL_PAD_L + FILL_PAD_R);
  const HP_FILL_H = 5;

  const XP_FILL_X = XP_START_X + FILL_PAD_L;
  const XP_FILL_Y = XP_CENTER_Y;
  const XP_FILL_W = (XP_END_X - XP_START_X) - (FILL_PAD_L + FILL_PAD_R);
  const XP_FILL_H = 5;

  // Centers for number text
  const HP_BAR_CX = (HP_START_X + HP_END_X) / 2;
  const XP_BAR_CX = (XP_START_X + XP_END_X) / 2;

  // Gap label positions (from your clicks)
  const HP_LABEL_X = 44;
  const HP_LABEL_Y = 24;

  const XP_LABEL_X = 44;
  const XP_LABEL_Y = 58;

  // Score position (screen px)
  const SCORE_X = 16;
  const SCORE_Y = 92;

  function init(phaserScene) {
    scene = phaserScene;

    // HUD container (screen-space)
    hud = scene.add.container(HUD_X, HUD_Y);
    hud.setScrollFactor(0);
    hud.setDepth(200);
    hud.setScale(HUD_SCALE);

    // HP fill (behind PNG)
    hpFill = scene.add.rectangle(HP_FILL_X, HP_FILL_Y, HP_FILL_W, HP_FILL_H, 0xff3333);
    hpFill.setOrigin(0, 0.5);

    // XP fill (behind PNG)
    xpFill = scene.add.rectangle(XP_FILL_X, XP_FILL_Y, XP_FILL_W, XP_FILL_H, 0x00ccff);
    xpFill.setOrigin(0, 0.5);

    // Frame PNG (on top)
    frameImg = scene.add.image(0, 0, 'hudBars').setOrigin(0, 0);

    // HP label in gap
    hpLabel = scene.add.text(HP_LABEL_X, HP_LABEL_Y, 'HP', {
      fontSize: '7px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0, 0.5);

    // XP label in gap
    xpLabel = scene.add.text(XP_LABEL_X, XP_LABEL_Y, 'XP', {
      fontSize: '7px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0, 0.5);

    // HP numbers centered on bar
    hpText = scene.add.text(HP_BAR_CX, HP_CENTER_Y, '0/0', {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0.5);

    // XP numbers centered on bar
    xpText = scene.add.text(XP_BAR_CX, XP_CENTER_Y, '0/0', {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0.5);

    // Add in back-to-front order
    hud.add([hpFill, xpFill, frameImg, hpLabel, xpLabel, hpText, xpText]);

    // Score (separate)
    scoreText = scene.add.text(SCORE_X, SCORE_Y, 'Score: R 0 | B 0', {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    });
    scoreText.setScrollFactor(0);
    scoreText.setDepth(210);

    // ~~~~ click helper ~~~~
    scene.input.on('pointerdown', (p) => {
      if (!hud) return;
      const lx = (p.x - hud.x) / hud.scaleX;
      const ly = (p.y - hud.y) / hud.scaleY;
      console.log('HUD local px:', Math.round(lx), Math.round(ly));
    });

    // Start full bars (so you can see it immediately)
    setBarWidth(hpFill, HP_FILL_W, HP_FILL_H);
    setBarWidth(xpFill, XP_FILL_W, XP_FILL_H);

    return window.UI;
  }

  function updateScores(scores) {
    if (!scores || !scoreText) return;
    scoreText.setText(`Score: R ${scores.red || 0} | B ${scores.blue || 0}`);
  }

  function updateHpXp({ hp = 0, maxHp = 0, xp = 0, maxXp = 0 } = {}) {
    // HP
    if (hpFill) {
      const p = (maxHp > 0) ? clamp01(hp / maxHp) : 0;
      const w = Math.floor(HP_FILL_W * p);
      setBarWidth(hpFill, w, HP_FILL_H);
      if (hpText) hpText.setText(`${Math.max(0, Math.floor(hp))}/${maxHp || 0}`);
    }

    // XP
    if (xpFill) {
      const p = (maxXp > 0) ? clamp01(xp / maxXp) : 0;
      const w = Math.floor(XP_FILL_W * p);
      setBarWidth(xpFill, w, XP_FILL_H);
      if (xpText) xpText.setText(`${Math.max(0, Math.floor(xp))}/${maxXp || 0}`);
    }
  }

  // Keep HUD pinned
  function tick(camera) {
    if (!camera) return;
    if (hud) hud.setPosition(HUD_X, HUD_Y);
    if (scoreText) scoreText.setPosition(SCORE_X, SCORE_Y);
  }

  function updateMinimap() {}

  // ~~~~ helpers ~~~~
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function setBarWidth(rect, w, h) {
    // Keep origin-left scaling clean
    const ww = Math.max(0, w);
    rect.setSize(ww, h);
    rect.setDisplaySize(ww, h);
  }

  window.UI = { init, updateScores, updateHpXp, tick, updateMinimap };
})();
