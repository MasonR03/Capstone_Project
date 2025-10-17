
export function startRender(canvas, net, hudNet) {
  const ctx = canvas.getContext("2d");

  function drawShip(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-10, 6);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, -6);
    ctx.closePath();
    ctx.strokeStyle = "#a5b4fc";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function frame() {
    const snap = net.getRenderState(100);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (snap) {
      // border
      ctx.strokeStyle = "#1f2a44";
      ctx.strokeRect(0.5, 0.5, snap.width - 1, snap.height - 1);

      // players
      for (const p of snap.players) {
        drawShip(ctx, p.x, p.y, p.angle);
      }

      if (hudNet) {
        const age = Math.max(0, Math.round(performance.now() + net.offset - (snap.serverTime || 0)));
        hudNet.textContent = `snapshots: ${net.history.length} • est ping: ~${age} ms`;
      }
    } else {
      hudNet && (hudNet.textContent = "waiting for server…");
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
