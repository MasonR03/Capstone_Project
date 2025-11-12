// Plain global utility (no modules). Load before clientGame.js
window.UI = (function () {
  const BORDER_COLOR = 0x00ffff;
  const MY_DOT = 0x00e5ff;
  const OTHER_DOT = 0xffffff;
  const STAR_DOT = 0xffd93b;

  function create(scene, worldW, worldH, opts = {}) {
    const cam = scene.cameras.main;
    const size = opts.size || 160;      // square box size
    const radius = (opts.radius || 70); // circle radius inside box
    const margin = opts.margin || 20;

    // container anchored to screen (no scroll)
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

    // a graphics layer for dots (masked)
    const dots = scene.add.graphics().setScrollFactor(0);
    dots.setMask(geoMask);

    // border ring
    const ring = scene.add.graphics().setScrollFactor(0);
    ring.lineStyle(3, BORDER_COLOR, 1);
    ring.strokeCircle(0, 0, radius);

    // optional faint background
    const bg = scene.add.graphics().setScrollFactor(0);
    bg.fillStyle(0x000000, 0.4);
    bg.fillCircle(0, 0, radius);

    cont.add([bg, dots, ring]);

    return {
      cont,
      dots,
      maskG,
      worldW,
      worldH,
      radius
    };
  }

  // map world (x,y) -> local coords inside the circle
  function project(ui, x, y) {
    const pad = 12; // keep dots away from edge
    const w = ui.worldW, h = ui.worldH;
    const r = ui.radius - pad;
    // normalize 0..1 then center to -0.5..0.5 and scale
    const nx = (x / w) - 0.5;
    const ny = (y / h) - 0.5;
    return { x: nx * (r * 2), y: ny * (r * 2) };
  }

  function update(ui, scene, players, stars, myId) {
    // redraw all dots each frame (cheap)
    ui.dots.clear();

    // stars (yellow)
    if (Array.isArray(stars)) {
      ui.dots.fillStyle(STAR_DOT, 1);
      stars.forEach(s => {
        const p = project(ui, s.x, s.y);
        ui.dots.fillCircle(p.x, p.y, 3);
      });
    }

    // players (you=cyan, others=white)
    Object.keys(players || {}).forEach(id => {
      const pl = players[id];
      const color = (id === myId) ? MY_DOT : OTHER_DOT;
      ui.dots.fillStyle(color, 1);
      const p = project(ui, pl.x, pl.y);
      ui.dots.fillCircle(p.x, p.y, 3.5);
    });
  }

  return { create, update };
})();