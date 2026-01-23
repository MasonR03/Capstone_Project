/**
 * UI Module - Backward compatibility wrapper
 *
 * Provides the original window.UI interface using the new HUD and LevelPanel classes.
 * Maintains full backward compatibility with existing clientGame.js code.
 */

(function () {
  let scene;

  // HUD elements
  let hud;
  let frameImg;
  let hpFill, xpFill;
  let hpNumText, xpNumText;
  let scoreText;

  // Slide panel elements
  let panel;
  let panelBg;
  let panelTween = null;
  let panelOpen = false;
  let panelAnimating = false;

  // Toggle tab
  let tabBtn;
  let tabTween = null;

  // Layout constants
  const HUD_X = 16;
  const HUD_Y = 16;

  const HP_START_X = 50;
  const HP_CENTER_Y = 14;
  const HP_END_X = 128;

  const XP_START_X = 50;
  const XP_CENTER_Y = 48;
  const XP_END_X = 128;

  const HP_TEXT_X = 44;
  const HP_TEXT_Y = 24;
  const XP_TEXT_X = 45;
  const XP_TEXT_Y = 56;

  const FILL_PAD_X = 2;

  const HP_NUM_X = Math.floor((HP_START_X + HP_END_X) / 2);
  const HP_NUM_Y = HP_CENTER_Y;
  const XP_NUM_X = Math.floor((XP_START_X + XP_END_X) / 2);
  const XP_NUM_Y = XP_CENTER_Y;

  // Panel constants
  const PANEL_W = 260;
  const PANEL_H = 220;
  const PANEL_MARGIN = 16;
  const PANEL_Z = 999;

  const TAB_Z = 1000;
  const TAB_OFFSET_Y = 18;
  const TAB_OUTSIDE_PAD = 6;

  function safeAdd(container, obj) {
    if (container && obj && obj.scene) container.add(obj);
  }

  function init(phaserScene) {
    scene = phaserScene;

    // HUD container
    hud = scene.add.container(HUD_X, HUD_Y).setScrollFactor(0).setDepth(200);

    // Fills
    const hpFullW = Math.max(0, (HP_END_X - HP_START_X) - (FILL_PAD_X * 2));
    const xpFullW = Math.max(0, (XP_END_X - XP_START_X) - (FILL_PAD_X * 2));
    const hpH = 8;
    const xpH = 8;

    hpFill = scene.add.rectangle(
      HP_START_X + FILL_PAD_X,
      HP_CENTER_Y,
      hpFullW,
      hpH,
      0xff3333
    ).setOrigin(0, 0.5);

    xpFill = scene.add.rectangle(
      XP_START_X + FILL_PAD_X,
      XP_CENTER_Y,
      xpFullW,
      xpH,
      0x00ccff
    ).setOrigin(0, 0.5);

    // Frame PNG
    if (scene.textures.exists('hudBars')) {
      frameImg = scene.add.image(0, 0, 'hudBars').setOrigin(0, 0);
      console.log('HUD frame size:', frameImg.width, frameImg.height);
    } else {
      console.warn('UI: Missing texture key "hudBars"');
      frameImg = scene.add.rectangle(0, 0, 140, 64, 0x222222, 0.5).setOrigin(0, 0);
    }

    // Center numbers
    hpNumText = scene.add.text(HP_NUM_X, HP_NUM_Y, '0/0', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5);

    xpNumText = scene.add.text(XP_NUM_X, XP_NUM_Y, '0/0', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5);

    // Add to container
    safeAdd(hud, hpFill);
    safeAdd(hud, xpFill);
    safeAdd(hud, frameImg);
    safeAdd(hud, hpNumText);
    safeAdd(hud, xpNumText);

    // Score text
    scoreText = scene.add.text(20, 80, 'Score: R 0 | B 0', {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(210);

    // Panel
    buildPanel();

    return window.UI;
  }

  function buildPanel() {
    const cam = scene.cameras.main;

    const openY = cam.height - PANEL_MARGIN - PANEL_H;
    const closedX = -PANEL_W + 24;

    panel = scene.add.container(closedX, openY)
      .setScrollFactor(0)
      .setDepth(PANEL_Z);

    panelBg = scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x0b0b0b, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.18);
    safeAdd(panel, panelBg);

    const title = scene.add.text(14, 12, 'LEVEL UP', {
      fontSize: '16px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0, 0);
    safeAdd(panel, title);

    const hint = scene.add.text(14, 44, 'Coming soon:\n- Spend points\n- Upgrades\n- Perks', {
      fontSize: '12px',
      fill: '#cccccc',
      fontFamily: 'monospace'
    }).setOrigin(0, 0);
    safeAdd(panel, hint);

    // Tab button
    const hasIn = scene.textures.exists('menuIn');
    const hasOut = scene.textures.exists('menuOut');

    if (!hasIn) console.warn('UI: Missing texture key "menuIn"');
    if (!hasOut) console.warn('UI: Missing texture key "menuOut"');

    tabBtn = hasIn
      ? scene.add.image(0, 0, 'menuOut').setOrigin(0.5, 0.5)
      : scene.add.rectangle(0, 0, 22, 22, 0x00ffcc, 0.85).setOrigin(0.5, 0.5);

    tabBtn.setScrollFactor(0).setDepth(TAB_Z);
    tabBtn.setInteractive({ useHandCursor: true });
    tabBtn.on('pointerdown', () => togglePanel());

    scene.input.keyboard.on('keydown-P', () => openPanel());
    scene.input.keyboard.on('keydown-L', () => closePanel());

    tick(cam);
  }

  function togglePanel() {
    if (panelAnimating) return;
    if (panelOpen) closePanel();
    else openPanel();
  }

  function openPanel() {
    if (!panel || panelAnimating || panelOpen) return;
    panelAnimating = true;

    if (panelTween) panelTween.stop();
    if (tabTween) tabTween.stop();

    const cam = scene.cameras.main;
    const openX = PANEL_MARGIN;
    const openY = cam.height - PANEL_MARGIN - PANEL_H;

    panelTween = scene.tweens.add({
      targets: panel,
      x: openX,
      y: openY,
      duration: 240,
      ease: 'Sine.easeOut',
      onComplete: () => {
        panelAnimating = false;
        panelOpen = true;
      }
    });

    if (tabBtn && scene.textures.exists('menuIn')) tabBtn.setTexture('menuIn');
  }

  function closePanel() {
    if (!panel || panelAnimating || !panelOpen) return;
    panelAnimating = true;

    if (panelTween) panelTween.stop();
    if (tabTween) tabTween.stop();

    const cam = scene.cameras.main;
    const closedX = -PANEL_W + 24;
    const openY = cam.height - PANEL_MARGIN - PANEL_H;

    panelTween = scene.tweens.add({
      targets: panel,
      x: closedX,
      y: openY,
      duration: 240,
      ease: 'Sine.easeIn',
      onComplete: () => {
        panelAnimating = false;
        panelOpen = false;
      }
    });

    if (tabBtn && scene.textures.exists('menuOut')) tabBtn.setTexture('menuOut');
  }

  function updateScores(scores) {
    if (!scores || !scoreText) return;
    scoreText.setText(`Score: R ${scores.red || 0} | B ${scores.blue || 0}`);
  }

  function updateHpXp({ hp = 0, maxHp = 0, xp = 0, maxXp = 0 } = {}) {
    // HP
    if (hpFill && maxHp > 0) {
      const p = Math.max(0, Math.min(1, hp / maxHp));
      const full = (HP_END_X - HP_START_X) - (FILL_PAD_X * 2);
      hpFill.width = Math.max(0, full * p);
      if (hpNumText) hpNumText.setText(`${Math.max(0, Math.floor(hp))}/${maxHp}`);
    } else {
      if (hpNumText) hpNumText.setText('0/0');
    }

    // XP
    if (xpFill && maxXp > 0) {
      const p = Math.max(0, Math.min(1, xp / maxXp));
      const full = (XP_END_X - XP_START_X) - (FILL_PAD_X * 2);
      xpFill.width = Math.max(0, full * p);
      if (xpNumText) xpNumText.setText(`${Math.max(0, Math.floor(xp))}/${maxXp}`);
    } else {
      if (xpNumText) xpNumText.setText('0/0');
    }
  }

  function tick(camera) {
    if (!camera) return;

    hud && hud.setPosition(HUD_X, HUD_Y);
    scoreText && scoreText.setPosition(20, 80);

    if (panel) {
      const baseY = camera.height - PANEL_MARGIN - PANEL_H;
      panel.y = baseY;

      if (panelOpen && !panelAnimating) panel.x = PANEL_MARGIN;
    }

    if (tabBtn && panel) {
      const tabX = panel.x + PANEL_W + TAB_OUTSIDE_PAD;
      const tabY = panel.y + TAB_OFFSET_Y;
      tabBtn.setPosition(tabX, tabY);
    }
  }

  function updateMinimap() {
    // Minimap handled separately by MiniMap module
  }

  window.UI = { init, updateScores, updateHpXp, tick, updateMinimap };
})();
