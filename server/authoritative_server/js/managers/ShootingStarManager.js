/**
 * ShootingStarManager - Spawns shooting stars at regular intervals
 *
 * Owns all spawn randomization logic and emits events to connected clients.
 */

const COLORS = ['white', 'blue', 'purple', 'red', 'yellow', 'orange'];
const SPAWN_INTERVAL = 5000; // ms
const MARGIN = 100;

class ShootingStarManager {
  /**
   * @param {SocketIO.Server} io - Socket.IO server instance
   * @param {Object} worldConfig
   * @param {number} worldConfig.width
   * @param {number} worldConfig.height
   */
  constructor(io, worldConfig) {
    this.io = io;
    this.width = worldConfig.width;
    this.height = worldConfig.height;
    this._timer = 0;
  }

  /**
   * Accumulate time and spawn a star when the interval elapses.
   * @param {number} delta - Elapsed ms since last call
   */
  update(delta) {
    this._timer += delta;
    if (this._timer >= SPAWN_INTERVAL) {
      this._timer -= SPAWN_INTERVAL;
      this.io.emit('shootingStar', this._spawn());
    }
  }

  /**
   * Build a randomized shooting-star payload.
   * @returns {Object}
   * @private
   */
  _spawn() {
    let startX, startY, angleDeg;

    if (Math.random() < 0.2) {
      // 20% spawn inside the map
      startX = Math.floor(Math.random() * (this.width - 200)) + 100;
      startY = Math.floor(Math.random() * (this.height - 200)) + 100;
      angleDeg = Math.random() * 360;
    } else {
      // 80% spawn outside an edge
      const edge = Math.floor(Math.random() * 4);
      let minAngle, maxAngle;

      switch (edge) {
        case 0: // top
          startX = Math.floor(Math.random() * this.width);
          startY = -MARGIN;
          minAngle = 30; maxAngle = 150;
          break;
        case 1: // right
          startX = this.width + MARGIN;
          startY = Math.floor(Math.random() * this.height);
          minAngle = 120; maxAngle = 240;
          break;
        case 2: // bottom
          startX = Math.floor(Math.random() * this.width);
          startY = this.height + MARGIN;
          minAngle = 210; maxAngle = 330;
          break;
        case 3: // left
          startX = -MARGIN;
          startY = Math.floor(Math.random() * this.height);
          minAngle = -60; maxAngle = 60;
          break;
      }

      angleDeg = minAngle + Math.random() * (maxAngle - minAngle);
    }

    const angleRad = angleDeg * (Math.PI / 180);
    const speed = 15 + Math.random() * 105; // 15-120

    return {
      x: startX,
      y: startY,
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      scale: Math.random() < 0.1
        ? 0.4 + Math.random() * 0.3    // 10% large: 0.4-0.7
        : 0.1 + Math.random() * 0.15,  // 90% small: 0.1-0.25
      fades: Math.random() < 0.5,
      angularV: Math.random() < 0.6
        ? (Math.random() - 0.5) * 1.0   // 60% curve: -0.5 to 0.5
        : 0
    };
  }
}

module.exports = ShootingStarManager;
