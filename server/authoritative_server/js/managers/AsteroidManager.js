/**
 * AsteroidManager - server-owned asteroid fly-throughs.
 *
 * Asteroids spawn outside the arena, drift across it, damage ships on contact,
 * and can be destroyed by player bullets.
 */

const DEFAULT_CONFIG = {
  maxActive: 4,
  spawnIntervalMs: 3600,
  spawnMargin: 140,
  minSpeed: 75,
  maxSpeed: 145,
  hp: 50,
  radius: 32,
  contactDamage: 35,
  contactCooldownMs: 700,
  xpValue: 200
};

class AsteroidManager {
  constructor(worldConfig = {}, config = {}) {
    this.width = worldConfig.width || 2000;
    this.height = worldConfig.height || 2000;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.asteroids = new Map();
    this._nextId = 0;
    this._timer = this.config.spawnIntervalMs * 0.65;
  }

  update(delta, ships, bulletManager) {
    const spawned = [];
    const removed = [];
    const shipHits = [];
    const bulletHits = [];
    const destroyed = [];

    this._timer += delta;
    while (
      this._timer >= this.config.spawnIntervalMs &&
      this.asteroids.size < this.config.maxActive
    ) {
      this._timer -= this.config.spawnIntervalMs;
      const asteroid = this._spawn();
      this.asteroids.set(asteroid.id, asteroid);
      spawned.push(this.serialize(asteroid));
    }

    const dt = delta / 1000;
    const now = Date.now();

    this.asteroids.forEach((asteroid, id) => {
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rotation += asteroid.angularVelocity * dt;

      if (this._isOutOfBounds(asteroid)) {
        removed.push(id);
        return;
      }

      ships.forEach((ship) => {
        if (ship.hp <= 0) return;
        if (now - (asteroid.shipHitAt.get(ship.id) || 0) < this.config.contactCooldownMs) return;

        const hitRadius = asteroid.radius + (ship.collisionRadius || 26);
        if (!this._overlaps(asteroid.x, asteroid.y, ship.x, ship.y, hitRadius)) return;

        asteroid.shipHitAt.set(ship.id, now);
        const killed = ship.takeDamage(this.config.contactDamage);
        shipHits.push({
          asteroidId: id,
          shipId: ship.id,
          damage: this.config.contactDamage,
          killed
        });
      });

      if (!bulletManager) return;

      bulletManager.forEach((bullet, bulletId) => {
        if (!bullet.alive || asteroid.hp <= 0) return;

        const hitRadius = asteroid.radius + (bullet.radius || 4);
        if (!this._overlaps(asteroid.x, asteroid.y, bullet.x, bullet.y, hitRadius)) return;

        bulletManager.remove(bulletId);
        asteroid.hp -= bullet.damage || 0;
        bulletHits.push({
          asteroidId: id,
          bulletId,
          ownerId: bullet.ownerId,
          damage: bullet.damage || 0,
          hp: Math.max(0, asteroid.hp)
        });

        if (asteroid.hp <= 0) {
          destroyed.push({
            asteroidId: id,
            ownerId: bullet.ownerId,
            x: asteroid.x,
            y: asteroid.y,
            xpValue: this.config.xpValue
          });
        }
      });

      if (asteroid.hp <= 0) {
        removed.push(id);
      }
    });

    removed.forEach((id) => this.asteroids.delete(id));

    return { spawned, removed, shipHits, bulletHits, destroyed };
  }

  serializeAll() {
    return Array.from(this.asteroids.values()).map((asteroid) => this.serialize(asteroid));
  }

  serialize(asteroid) {
    return {
      id: asteroid.id,
      x: asteroid.x,
      y: asteroid.y,
      vx: asteroid.vx,
      vy: asteroid.vy,
      hp: asteroid.hp,
      maxHp: asteroid.maxHp,
      radius: asteroid.radius,
      rotation: asteroid.rotation,
      angularVelocity: asteroid.angularVelocity
    };
  }

  _spawn() {
    const edge = Math.floor(Math.random() * 4);
    const margin = this.config.spawnMargin;
    let x;
    let y;
    let targetX;
    let targetY;

    if (edge === 0) {
      x = Math.random() * this.width;
      y = -margin;
      targetX = Math.random() * this.width;
      targetY = this.height + margin;
    } else if (edge === 1) {
      x = this.width + margin;
      y = Math.random() * this.height;
      targetX = -margin;
      targetY = Math.random() * this.height;
    } else if (edge === 2) {
      x = Math.random() * this.width;
      y = this.height + margin;
      targetX = Math.random() * this.width;
      targetY = -margin;
    } else {
      x = -margin;
      y = Math.random() * this.height;
      targetX = this.width + margin;
      targetY = Math.random() * this.height;
    }

    const angle = Math.atan2(targetY - y, targetX - x);
    const speed = this.config.minSpeed + Math.random() * (this.config.maxSpeed - this.config.minSpeed);

    return {
      id: `a_${this._nextId++}`,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      hp: this.config.hp,
      maxHp: this.config.hp,
      radius: this.config.radius,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 2.2,
      shipHitAt: new Map()
    };
  }

  _isOutOfBounds(asteroid) {
    const margin = this.config.spawnMargin + asteroid.radius + 40;
    return asteroid.x < -margin ||
      asteroid.x > this.width + margin ||
      asteroid.y < -margin ||
      asteroid.y > this.height + margin;
  }

  _overlaps(ax, ay, bx, by, radius) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy <= radius * radius;
  }
}

module.exports = AsteroidManager;
