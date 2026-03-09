/**
 * BulletManager - Server-side bullet lifecycle and collision detection
 *
 * Creates bullets, updates their positions, checks collisions with ships,
 * and broadcasts state to clients.
 */
const Bullet = require('../entities/Bullet');

class BulletManager {
  /**
   * @param {Object} worldConfig
   * @param {number} worldConfig.width
   * @param {number} worldConfig.height
   * @param {Object} weaponConfig
   */
  constructor(worldConfig, weaponConfig = {}) {
    this.bullets = new Map(); // id -> Bullet
    this._nextId = 0;

    this.worldWidth = worldConfig.width || 2000;
    this.worldHeight = worldConfig.height || 2000;

    this.bulletSpeed = weaponConfig.bulletSpeed || 500;
    this.bulletLifetime = weaponConfig.bulletLifetime || 2000;
    this.bulletDamage = weaponConfig.bulletDamage || 15;
    this.fireRate = weaponConfig.fireRate || 250;

    // Track last fire time per player
    this.lastFireTime = new Map(); // socketId -> timestamp
  }

  /**
   * Try to create a bullet for a player
   * @param {string} ownerId - Socket ID of the shooter
   * @param {number} x - Ship x position
   * @param {number} y - Ship y position
   * @param {number} rotation - Ship rotation
   * @returns {Bullet|null} - The created bullet or null if rate-limited
   */
  tryFire(ownerId, x, y, rotation) {
    const now = Date.now();
    const lastFire = this.lastFireTime.get(ownerId) || 0;

    if (now - lastFire < this.fireRate) {
      return null; // rate limited
    }

    this.lastFireTime.set(ownerId, now);

    const id = `b_${this._nextId++}`;
    const bullet = new Bullet(id, ownerId, x, y, rotation, {
      speed: this.bulletSpeed,
      lifetime: this.bulletLifetime,
      damage: this.bulletDamage
    });

    this.bullets.set(id, bullet);
    return bullet;
  }

  /**
   * Update all bullets and check collisions
   * @param {number} delta - ms since last update
   * @param {Map} ships - Map of id -> Ship from EntityManager
   * @returns {Object} - { destroyed: [{bulletId, shipId, damage}], removed: [bulletId] }
   */
  update(delta, ships) {
    const destroyed = [];
    const removed = [];

    this.bullets.forEach((bullet, id) => {
      bullet.update(delta);

      // Remove if dead (lifetime expired)
      if (!bullet.alive) {
        removed.push(id);
        return;
      }

      // Remove if out of bounds
      if (bullet.x < -50 || bullet.x > this.worldWidth + 50 ||
          bullet.y < -50 || bullet.y > this.worldHeight + 50) {
        bullet.alive = false;
        removed.push(id);
        return;
      }

      // Check collision with ships
      ships.forEach((ship) => {
        if (!bullet.alive) return;
        if (ship.id === bullet.ownerId) return; // don't hit self
        if (ship.hp <= 0) return; // skip dead ships

        // Simple circle-rect collision
        const dx = bullet.x - ship.x;
        const dy = bullet.y - ship.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Use ship half-width as collision radius (~26)
        if (dist < 26 + bullet.radius) {
          bullet.alive = false;
          removed.push(id);

          const killed = ship.takeDamage(bullet.damage);
          destroyed.push({
            bulletId: id,
            ownerId: bullet.ownerId,
            shipId: ship.id,
            damage: bullet.damage,
            killed
          });
        }
      });
    });

    // Clean up dead bullets
    removed.forEach((id) => this.bullets.delete(id));

    return { destroyed, removed };
  }

  /**
   * Remove all bullets belonging to a player (on disconnect)
   * @param {string} ownerId
   */
  removeByOwner(ownerId) {
    this.bullets.forEach((bullet, id) => {
      if (bullet.ownerId === ownerId) {
        this.bullets.delete(id);
      }
    });
    this.lastFireTime.delete(ownerId);
  }

  /**
   * Serialize all bullets for network broadcast
   * @returns {Array}
   */
  serializeAll() {
    const result = [];
    this.bullets.forEach((bullet) => {
      if (bullet.alive) {
        result.push(bullet.serialize());
      }
    });
    return result;
  }

  /**
   * Get active bullet count
   */
  getCount() {
    return this.bullets.size;
  }
}

module.exports = BulletManager;
