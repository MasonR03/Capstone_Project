// Tiny UI module for Phaser client (hp/xp bars + round minimap + score text)
window.ClientUI = (function () {
  const MINIMAP_RADIUS = 70;           // circle radius in px
  const MINIMAP_MARGIN = 20;           // from the screen corner
  const DOT_SIZE = 3;                  // player dot radius
  const STAR_DOT = 2;                  // star dot radius

  let scene = null;
  let worldW = 2000, worldH = 2000;

  // bars & text
  let hpBg, hpFill, hpText;
  let xpBg, xpFill, xpText;
  let scoreText;

  // minimap
  let miniContainer, miniGfx, miniMaskGfx, miniMask;
  let miniScaleX = 1, miniScaleY = 1;

  function init(phaserScene, opts = {}) {
    scene = phaserScene;
    worldW = opts.worldW || worldW;
    worldH = opts.worldH || worldH;

    // ---- Score text (top-left) ----
    scoreText = scene.add.text(
      16, 16, "Score: R 0 | B 0",
      { fontSize: '18px', fill: '#ffffff', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(1000);

    // ---- HP / XP bars (bottom-center) ----
    const cam = scene.cameras.main;
    const cx = cam.width / 2;

    hpBg = scene.add.rectangle(cx, cam.height - 80, 220, 20, 0x1e1e1e)
      .setScrollFactor(0).setDepth(1000);
    hpFill = scene.add.rectangle(cx - 110 + 1, cam.height - 80, 0, 18, 0xff3a3a)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1001);
    hpText = scene.add.text(cx, cam.height - 80, "HP 100/100",
      { fontSize: '14px', fill: '#ffffff', fontFamily: 'monospace' })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1002);

    xpBg = scene.add.rectangle(cx, cam.height - 50, 220, 10, 0x1e1e1e)
      .setScrollFactor(0).setDepth(1000);
    xpFill = scene.add.rectangle(cx - 110 + 1, cam.height - 50, 0, 8, 0x00c8ff)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1001);
    xpText = scene.add.text(cx, cam.height - 50, "XP 0/100",
      { fontSize: '12px', fill: '#aee9ff', fontFamily: 'monospace' })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1002);

    // ---- Round minimap (bottom-right) ----
    miniContainer = scene.add.container(
      cam.width - (MINIMAP_RADIUS + MINIMAP_MARGIN),
      cam.height - (MINIMAP_RADIUS + MINIMAP_MARGIN)
    ).setScrollFactor(0).setDepth(1000);

    // back plate
    const plate = scene.add.circle(0, 0, MINIMAP_RADIUS + 8, 0x000000)
      .setStrokeStyle(2, 0x00ffff, 0.8);
    miniContainer.add(plate);

    // drawing layer for dots & grid
    miniGfx = scene.add.graphics();
    miniContainer.add(miniGfx);

    // circular mask to clip the drawing layer
    miniMaskGfx = scene.make.graphics({ x: 0, y: 0, add: false });
    miniMaskGfx.fillStyle(0xffffff).fillCircle(0, 0, MINIMAP_RADIUS);
    miniMask = miniMaskGfx.createGeometryMask();
    miniGfx.setMask(miniMask);

    // scales (world → minimap)
    miniScaleX = (MINIMAP_RADIUS * 2) / worldW;
    miniScaleY = (MINIMAP_RADIUS * 2) / worldH;
  }

  function setScores(scores) {
    if (!scoreText) return;
    const r = scores?.red ?? 0;
    const b = scores?.blue ?? 0;
    scoreText.setText(`Score: R ${r} | B ${b}`);
  }

  function setStats(hp, maxHp, xp, maxXp) {
    if (!hpFill || !xpFill) return;
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const xpPct = maxXp > 0 ? Math.max(0, Math.min(1, xp / maxXp)) : 0;

    hpFill.width = Math.floor((220 - 2) * hpPct);
    xpFill.width = Math.floor((220 - 2) * xpPct);

    hpText.setText(`HP ${hp}/${maxHp}`);
    xpText.setText(`XP ${xp}/${maxXp}`);
  }

  // players: map id -> {x,y,team}, stars: [{x,y}]
  function updateMinimap(players, stars, myId) {
    if (!miniGfx) return;

    miniGfx.clear();

    // subtle grid
    miniGfx.lineStyle(1, 0x006b6b, 0.15);
    for (let t = -MINIMAP_RADIUS; t <= MINIMAP_RADIUS; t += 20) {
      miniGfx.lineBetween(-MINIMAP_RADIUS, t, MINIMAP_RADIUS, t);
      miniGfx.lineBetween(t, -MINIMAP_RADIUS, t, MINIMAP_RADIUS);
    }

    // draw stars
    if (Array.isArray(stars)) {
      miniGfx.fillStyle(0xffd000, 1);
      stars.forEach(s => {
        const { x, y } = worldToMini(s.x, s.y);
        miniGfx.fillCircle(x, y, STAR_DOT);
      });
    }

    // draw players
    Object.keys(players || {}).forEach(id => {
      const p = players[id];
      const { x, y } = worldToMini(p.x, p.y);

      // me = white, else team color
      let color = 0xffffff;
      if (id !== myId) {
        color = (p.team === 'red') ? 0xff4d4d : 0x4d7dff;
      }
      miniGfx.fillStyle(color, 1);
      miniGfx.fillCircle(x, y, DOT_SIZE + (id === myId ? 1 : 0));
    });

    // ring
    miniGfx.lineStyle(2, 0x00ffff, 0.7);
    miniGfx.strokeCircle(0, 0, MINIMAP_RADIUS);
  }

  function worldToMini(wx, wy) {
    // map [0..world] → [-R..R]
    return {
      x: Math.round(wx * miniScaleX - MINIMAP_RADIUS),
      y: Math.round(wy * miniScaleY - MINIMAP_RADIUS)
    };
  }

  return { init, setScores, setStats, updateMinimap };
})();
