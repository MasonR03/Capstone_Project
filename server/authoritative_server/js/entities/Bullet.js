/**
 * Bullet - Projectile entity fired by ships
 *
 * Lightweight object with position, velocity, and lifetime tracking.
 * Movement is handled manually (no physics body) to keep things fast.
 */
class Bullet {
  constructor(id, ownerId, x, y, rotation, config = {}) {
    this.id = id;
    this.ownerId = ownerId;

    // Spawn slightly ahead of the ship nose
    const angle = rotation + 1.5; // match server's angle offset
    const spawnOffset = 30;
    this.x = x + Math.cos(angle) * spawnOffset;
    this.y = y + Math.sin(angle) * spawnOffset;

    // Velocity in the direction the ship is facing
    const speed = config.speed || 500;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.damage = config.damage || 15;
    this.lifetime = config.lifetime || 2000; // ms
    this.age = 0;
    this.alive = true;

    // For collision detection
    this.radius = config.radius || 4;
  }

  /**
   * Advance bullet position
   * @param {number} delta - ms since last update
   */
  update(delta) {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.age += delta;

    if (this.age >= this.lifetime) {
      this.alive = false;
    }
  }

  /**
   * Serialize for network broadcast
   */
  serialize() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y
    };
  }
}

module.exports = Bullet;
