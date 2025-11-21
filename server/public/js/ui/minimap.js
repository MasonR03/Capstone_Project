// public/js/ui/minimap.js
// A round minimap that follows the local player (myId), shows stars & players,
// and draws edge markers when you're near the world boundaries.
(function () {
  const BORDER_COLOR = 0x00ffff;
  const MY_DOT      = 0x00e5ff;
  const RED_DOT     = 0xff6666;
  const BLUE_DOT    = 0x6688ff;
  const OTHER_DOT   = 0xffffff;
  const STAR_DOT    = 0xffd93b;

  // Create a round minimap UI container (screen-anchored)
  function create(scene, worldW, worldH, opts = {}) {
    const cam    = scene.cameras.main;
    const size   = opts.size   ?? 160;      // square container
    const radius = opts.radius ?? 70;       // circle radius inside container
    const margin = opts.margin ?? 20;

    const cont = scene.add.container(
      cam.width - (size / 2) - margin,
      cam.height - (size / 2) - margin
    ).setScrollFactor(0).setDepth(2000);

    // circular mask
    const maskG = scene.add.graphics().setScrollFactor(0);
    maskG.fillStyle(0xffffff, 1);
    maskG.fillCircle(0, 0, radius);
    const geoMask = maskG.createGeometryMask();
    maskG.setVisible(false);

    // draw layer (masked)
    const g = scene.add.graphics().setScrollFactor(0);
    g.setMask(geoMask);

    // ring & soft background
    const ring = scene.add.graphics().setScrollFactor(0);
    ring.lineStyle(3, BORDER_COLOR, 1);
    ring.strokeCircle(0, 0, radius);

    const bg = scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x000000, 0.45);
    bg.fillCircle(0, 0, radius);

    cont.add([bg, g, ring]);

    return {
      cont,
      g,           // graphics for dots & edges
      radius,
      worldW,
      worldH,
      // how much world we show from map center to rim (in world units)
      worldRange: opts.worldRange ?? 600
    };
  }

  // Keep the minimap anchored to the bottom-right when the camera size changes
  function anchor(minimap, scene, opts = {}) {
    const cam = scene.cameras.main;
    const size   = opts.size   ?? 160;
    const margin = opts.margin ?? 20;
    minimap.cont.setPosition(
      cam.width - (size / 2) - margin,
      cam.height - (size / 2) - margin
    );
  }

  // Project world (dx,dy) relative to the local player into minimap space
  function projectRelative(minimap, dx, dy) {
    const r = minimap.radius - 8;                  // pad from rim
    const s = r / minimap.worldRange;              // pixels per world unit
    return { x: dx * s, y: dy * s, r };
  }

  // Draw a small tick on the rim pointing toward off-screen stuff
  function rimTick(g, angle, radius, color = 0xffffff) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const x1 = ca * (radius - 8),  y1 = sa * (radius - 8);
    const x2 = ca * (radius - 2),  y2 = sa * (radius - 2);
    g.lineStyle(2, color, 1);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
  }

  // Edge markers when near world boundaries (left/right/top/bottom)
  function drawWorldEdges(minimap, g, me) {
    const edgeDist = 250; // start hinting within this distance to an edge
    g.lineStyle(2, 0xff4d4d, 0.9);

    if (me.x < edgeDist)               rimTick(g, Math.PI, minimap.radius, 0xff4d4d);       // left
    if (minimap.worldW - me.x < edgeDist) rimTick(g, 0, minimap.radius, 0xff4d4d);          // right
    if (me.y < edgeDist)               rimTick(g, -Math.PI/2, minimap.radius, 0xff4d4d);    // top
    if (minimap.worldH - me.y < edgeDist) rimTick(g, Math.PI/2, minimap.radius, 0xff4d4d);  // bottom
  }

  // Main per-frame render
  // players: map id -> {x,y,team}, stars: [{x,y}], myId: string
  function update(minimap, players, stars, myId) {
    const g = minimap.g;
    g.clear();

    // ring background redraw (cheap)
    g.fillStyle(0x000000, 0.0); // nothing; dots only

    const me = players?.[myId];
    if (!me) return; // nothing to center on yet

    // Show world edge hints
    drawWorldEdges(minimap, g, me);

    // Helper to place a point; clamp to rim and draw a tick if off-map
    function plot(dx, dy, color, radius = 3) {
      const p = projectRelative(minimap, dx, dy);
      let x = p.x, y = p.y;

      // inside circle?
      if ((x*x + y*y) <= p.r * p.r) {
        g.fillStyle(color, 1);
        g.fillCircle(x, y, radius);
      } else {
        // clamp to rim and draw a small tick
        const ang = Math.atan2(y, x);
        rimTick(g, ang, minimap.radius, color);
      }
    }

    // Stars (gold)
    if (Array.isArray(stars)) {
      stars.forEach(s => plot(s.x - me.x, s.y - me.y, STAR_DOT, 3));
    }

    // Players
    for (const id in players) {
      const p = players[id];
      const color = (id === myId) ? MY_DOT : (p.team === 'red' ? RED_DOT : BLUE_DOT);
      plot(p.x - me.x, p.y - me.y, color, id === myId ? 4 : 3.2);
    }

    // Draw your own center dot last (always visible)
    g.fillStyle(MY_DOT, 1);
    g.fillCircle(0, 0, 4.5);
  }

  window.MiniMap = { create, update, anchor };
})();
