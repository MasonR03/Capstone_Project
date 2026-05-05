/**
 * CollectibleStarManager - Authoritative collectible star state.
 *
 * Keeps collectible stars synced across clients and enforces a global cap.
 */
class CollectibleStarManager {
  /**
   * @param {Object} world
   * @param {number} world.width
   * @param {number} world.height
   * @param {Object} config
   */
  constructor(world = {}, config = {}) {
    this.world = {
      width: world.width || 2000,
      height: world.height || 2000
    };

    this.maxCount = config.maxCount || 6;
    this.spawnIntervalMs = config.spawnIntervalMs || 3000;
    this.spawnMargin = config.spawnMargin || 100;
    this.collectRadius = config.collectRadius || 58;
    this.xpValue = config.xpValue || 30;
    this.pointValue = config.pointValue || 1;

    this.stars = new Map();
    this.nextId = 1;
    this.spawnAccumulatorMs = 0;
  }

  /**
   * Fill the map up to the configured star cap.
   *
   * @returns {Array<Object>}
   */
  fillToCap() {
    const spawned = [];

    while (this.stars.size < this.maxCount) {
      spawned.push(this._spawn());
    }

    return spawned;
  }

  /**
   * Spawn replacement stars over time without exceeding the cap.
   *
   * @param {number} deltaMs
   * @returns {Array<Object>}
   */
  update(deltaMs) {
    if (this.stars.size >= this.maxCount) {
      this.spawnAccumulatorMs = 0;
      return [];
    }

    this.spawnAccumulatorMs += Math.max(0, Number(deltaMs) || 0);
    const spawned = [];

    while (this.spawnAccumulatorMs >= this.spawnIntervalMs && this.stars.size < this.maxCount) {
      this.spawnAccumulatorMs -= this.spawnIntervalMs;
      spawned.push(this._spawn());
    }

    return spawned;
  }

  /**
   * Attempt to collect a star with a ship.
   *
   * @param {string|Object} starId
   * @param {Object} ship
   * @returns {Object|null}
   */
  tryCollect(starId, ship) {
    const id = this._normalizeId(starId);
    const star = id ? this.stars.get(id) : null;

    if (!star || !ship || ship.hp <= 0) return null;

    const shipX = Number.isFinite(ship.x) ? ship.x : ship.body?.x;
    const shipY = Number.isFinite(ship.y) ? ship.y : ship.body?.y;

    if (!Number.isFinite(shipX) || !Number.isFinite(shipY)) return null;

    const dx = shipX - star.x;
    const dy = shipY - star.y;

    if ((dx * dx) + (dy * dy) > this.collectRadius * this.collectRadius) {
      return null;
    }

    this.stars.delete(id);
    return { ...star };
  }

  /**
   * Serialize all active stars.
   *
   * @returns {Array<Object>}
   */
  serializeAll() {
    return Array.from(this.stars.values()).map((star) => ({ ...star }));
  }

  /**
   * @param {string|Object} value
   * @returns {string|null}
   * @private
   */
  _normalizeId(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return value.starId || value.id || null;
    }
    return null;
  }

  /**
   * Create one star.
   *
   * @returns {Object}
   * @private
   */
  _spawn() {
    const id = `star_${this.nextId++}`;
    const star = {
      id,
      x: this._randomCoordinate(this.world.width),
      y: this._randomCoordinate(this.world.height),
      xpValue: this.xpValue,
      pointValue: this.pointValue
    };

    this.stars.set(id, star);
    return { ...star };
  }

  /**
   * Pick a coordinate inside the world with a margin from the border.
   *
   * @param {number} max
   * @returns {number}
   * @private
   */
  _randomCoordinate(max) {
    const margin = Math.min(this.spawnMargin, Math.max(0, Math.floor(max / 2) - 1));
    const range = Math.max(1, max - (margin * 2));

    return Math.floor(Math.random() * range) + margin;
  }
}

module.exports = CollectibleStarManager;
