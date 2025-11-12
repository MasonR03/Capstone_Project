// ~~~ Lightweight UI module (HUD + round minimap) ~~~
// Exposes a global "UI" you can call from clientGame.js

(function () {
  const UI = {};
  let scene = null;

  // HUD refs
  let hpBg, hpFill, hpText;
  let xpBg, xpFill, xpText;
  let scoreText;

  // Minimap refs
  let miniContainer, miniBG, miniMask, miniDotsGroup;
  let miniRadius = 70;                     // minimap radius in px
  let worldW = 2000, worldH = 2000;        // must match your WORLD_W/H
  let scaleX, scaleY;

  // Colors
  const COLOR_HP_BG = 0x222222;
  const COLOR_HP = 0xff3333;
  const COLOR_XP_BG = 0x222222;
  const COLOR_XP = 0x00ccff;

  // Players & stars to draw on the minimap
  let lastPlayers = {};
  let lastStars = [];

  // ~~~ init ~~~
  UI.init = function (phaserScene, opts = {}) {
    scene = phaserScene;
    if (opts.worldW) worldW = opts.worldW;
    if (opts.worldH) worldH = opts.worldH;
    if (opts.miniRadius) miniRadius = opts.miniRadius;

    // scale world → minimap coords
    // (map worldW x worldH into a circle of diameter 2*miniRadius)
    scaleX = (miniRadius * 2) / worldW;
    scaleY = (miniRadius * 2) / worldH;

    const cam = scene.cameras.main;
    const cx = cam.width / 2;

    // ----- HUD: HP bar -----
    hpBg = scene.add.rectangle(
      cx, cam.height - 80, 200, 20, COLOR_HP_BG
    ).setScrollFactor(0).setDepth(100);

    hpFill = scene.add.rectangle(
      cx, cam.height - 80, 200, 20, COLOR_HP
    ).setScrollFactor(0).setDepth(101);

    hpText = scene.add.text(
      cx, cam.height - 80, 'HP 100/100',
      { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
    ).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(102);

    // ----- HUD: XP bar -----
    xpBg = scene.add.rectangle(
      cx, cam.height - 50, 200, 10, COLOR_XP_BG
    ).setScrollFactor(0).setDepth(100);

    xpFill = scene.add.rectangle(
      cx, cam.height - 50, 200, 10, COLOR_XP
    ).setScrollFactor(0).setDepth(101);

    xpText = scene.add.text(
      cx, cam.height - 50, 'XP 0/100',
      { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
    ).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(102);

    // ----- HUD: Score -----
    scoreText = scene.add.text(
      20, 20, 'Score: R 0 | B 0',
      { fontSize: '18px', fill: '#ffffff', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(100);

    // ----- Minimap (round) -----
    miniContainer = scene.add.container(
      cam.width - (miniRadius + 20),
      cam.height - (miniRadius + 20)
    ).setScrollFactor(0).setDepth(110);

    // circular background
    miniBG = scene.add.graphics();
    miniBG.fillStyle(0x000000, 0.6);
    miniBG.fillCircle(0, 0, miniRadius + 6);

    // mask circle
    const maskShape = scene.add.graphics();
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillCircle(0, 0, miniRadius);
    miniMask = maskShape.createGeometryMask();

    // dots group (players + stars)
    miniDotsGroup = scene.add.container(0, 0);
    miniDotsGroup.setMask(miniMask);

    miniContainer.add([miniBG, miniDotsGroup, maskShape]);
  };

  // ~~~ update per-frame ~~~
  UI.update = function (playersObj, starsArray, myId, stats) {
    if (!scene) return;

    // HP / XP
    const hp = Math.max(0, stats?.hp ?? 0);
    const hpMax = Math.max(1, stats?.maxHp ?? 100);
    const xp = Math.max(0, stats?.xp ?? 0);
    const xpMax = Math.max(1, stats?.maxXp ?? 100);

    const hpPct = hp / hpMax;
    const xpPct = xp / xpMax;

    hpFill.width = 200 * hpPct;
    xpFill.width = 200 * xpPct;

    hpText.setText(`HP ${hp}/${hpMax}`);
    xpText.setText(`XP ${xp}/${xpMax}`);

    // ----- Minimap rebuild only when inputs change -----
    const playersChanged = playersObj !== lastPlayers;
    const starsChanged = starsArray !== lastStars;
    if (!playersChanged && !starsChanged) return;

    lastPlayers = playersObj;
    lastStars = starsArray;

    miniDotsGroup.removeAll(true);

    // Draw stars as small yellow dots
    if (Array.isArray(starsArray)) {
      starsArray.forEach(st => {
        const dot = scene.add.circle(
          mapX(st.x), mapY(st.y), 2, 0xffd700
        );
        miniDotsGroup.add(dot);
      });
    }

    // Draw players as small dots (my dot brighter)
    Object.keys(playersObj || {}).forEach(id => {
      const p = playersObj[id];
      const isMe = (id === myId);
      const color = isMe ? 0x00ffff : (p.team === 'red' ? 0xff4444 : 0x4444ff);
      const r = isMe ? 3 : 2;
      const dot = scene.add.circle(mapX(p.x), mapY(p.y), r, color);
      miniDotsGroup.add(dot);
    });
  };

  // ~~~ score helper ~~~
  UI.setScore = function (scores) {
    if (!scoreText) return;
    const r = scores?.red ?? 0;
    const b = scores?.blue ?? 0;
    scoreText.setText(`Score: R ${r} | B ${b}`);
  };

  // ~~~ utils ~~~
  function mapX(x) {
    // map world x into circle coordinate space centered at 0,0
    return (x - worldW / 2) * scaleX;
  }
  function mapY(y) {
    return (y - worldH / 2) * scaleY;
  }

  // expose
  window.UI = UI;
})();
