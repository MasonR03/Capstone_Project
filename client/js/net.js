
export class Net {
  constructor() {
    this.socket = io();
    this.history = []; // snapshots sorted by serverTime (ms)
    this.offset = 0;   // serverTime - clientNow
    this.lastSnapTs = 0;

    this.socket.on("connect", () => {
      console.log("Connected:", this.socket.id);
    });

    this.socket.on("snapshot", (snap) => {
      this.history.push(snap);
      if (this.history.length > 30) this.history.shift(); // keep ~2 sec @ 15 Hz
      this.lastSnapTs = performance.now();
      const last = snap.serverTime;
      this.offset = last - performance.now();
    });
  }

  sendInput(input) {
    this.socket.emit("input", input);
  }

  getRenderState(interpDelay = 100) {
    if (this.history.length < 2) return this.history[this.history.length - 1] || null;
    const renderTime = performance.now() + this.offset - interpDelay;

    // find two snapshots bracketing renderTime
    let a = null, b = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const s = this.history[i];
      if (s.serverTime <= renderTime) { a = s; b = this.history[i+1] || s; break; }
    }
    if (!a || !b) { a = this.history[0]; b = this.history[1] || a; }

    const t0 = a.serverTime, t1 = Math.max(b.serverTime, t0 + 1);
    const alpha = Math.min(1, Math.max(0, (renderTime - t0) / (t1 - t0)));

    // interpolate players by id order (ids not included in skeleton state; interpolate by array index)
    const players = [];
    const n = Math.min(a.players.length, b.players.length);
    for (let i = 0; i < n; i++) {
      const p = a.players[i], q = b.players[i];
      players.push({
        x: p.x + (q.x - p.x) * alpha,
        y: p.y + (q.y - p.y) * alpha,
        angle: lerpAngle(p.angle, q.angle, alpha),
        hp: q.hp,
      });
    }
    return { serverTime: renderTime, width: a.width, height: a.height, players };
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
