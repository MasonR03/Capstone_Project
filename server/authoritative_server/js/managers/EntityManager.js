/**
 * EntityManager - Manages ship lifecycle and updates
 *
 * Centralizes ship creation, destruction, and update logic.
 * Provides methods for serializing all ships for network broadcast.
 */
const DefaultShip = require('../entities/DefaultShip');

class EntityManager {
  /**
   * Create a new EntityManager
   * @param {ArcadePhysics} physics - The arcade-physics instance
   * @param {Object} worldConfig - World configuration
   * @param {number} worldConfig.width - World width
   * @param {number} worldConfig.height - World height
   * @param {number} worldConfig.borderBuffer - Border buffer distance
   */
  constructor(physics, worldConfig = {}) {
    this.physics = physics;
    this.ships = new Map(); // id -> Ship

    this.worldConfig = {
      width: worldConfig.width || 2000,
      height: worldConfig.height || 2000,
      borderBuffer: worldConfig.borderBuffer || 20
    };

    // Collision tuning
    this.collisionDamageRatio = 0.25;
    this.collisionCooldownMs = 500;
  }

  /**
   * Create a new player ship
   * @param {string} socketId - The socket.id of the player
   * @param {number} x - Initial X position
   * @param {number} y - Initial Y position
   * @param {Object} config - Ship configuration
   * @returns {DefaultShip} - The created ship
   */
  createShip(socketId, x, y, config = {}) {
    // Merge world config into ship config
    const shipConfig = {
      ...config,
      worldWidth: this.worldConfig.width,
      worldHeight: this.worldConfig.height,
      borderBuffer: this.worldConfig.borderBuffer
    };

    const ship = new DefaultShip(socketId, x, y, shipConfig);
    ship.initPhysics(this.physics);

    this.ships.set(socketId, ship);

    return ship;
  }

  /**
   * Get a ship by ID
   * @param {string} id - The ship ID (socket.id for players)
   * @returns {Ship|undefined} - The ship or undefined if not found
   */
  getShip(id) {
    return this.ships.get(id);
  }

  /**
   * Check if a ship exists
   * @param {string} id - The ship ID
   * @returns {boolean} - True if ship exists
   */
  hasShip(id) {
    return this.ships.has(id);
  }

  /**
   * Remove a ship by ID
   * @param {string} id - The ship ID
   * @returns {boolean} - True if ship was removed
   */
  removeShip(id) {
    const ship = this.ships.get(id);
    if (ship) {
      ship.destroy();
      this.ships.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get the physics body for a ship
   * @param {string} id - The ship ID
   * @returns {Body|null} - The physics body or null
   */
  getBody(id) {
    const ship = this.ships.get(id);
    return ship ? ship.body : null;
  }

  /**
   * Update all ships (apply movement and sync from physics)
   * Call this after physics world update
   */
  updateAll() {
    this.ships.forEach((ship) => {
      ship.applyMovement(this.physics);
      ship.syncFromBody();
    });
  }

  /**
   * Detect ship-vs-ship and ship-vs-barrier collisions and apply damage.
   *
   * Each ship can only take collision damage once per
   * {@link EntityManager#collisionCooldownMs}, regardless of how many things
   * it overlaps in that window. Damage is 25% of the ship's maxHp, rounded up.
   *
   * @param {number} now - Current timestamp (ms).
   * @returns {Array<{shipId:string, source:'ship'|'barrier', otherId?:string, damage:number, killed:boolean}>}
   */
  processCollisions(now) {
    const events = [];
    const cooldown = this.collisionCooldownMs;
    const ratio = this.collisionDamageRatio;

    const tryDamage = (ship, source, otherId) => {
      if (ship.hp <= 0) return;
      if (now - ship.lastCollisionDamageAt < cooldown) return;
      const damage = Math.max(1, Math.ceil(ship.maxHp * ratio));
      const killed = ship.takeDamage(damage);
      ship.lastCollisionDamageAt = now;
      events.push({ shipId: ship.id, source, otherId, damage, killed });
    };

    // Barrier hits (rising-edge flagged in Ship.enforceBounds)
    this.ships.forEach((ship) => {
      if (ship.barrierHitThisFrame) {
        tryDamage(ship, 'barrier', null);
      }
    });

    // Ship-vs-ship overlap (circle test on collision radii)
    const shipArr = Array.from(this.ships.values());
    for (let i = 0; i < shipArr.length; i++) {
      const a = shipArr[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < shipArr.length; j++) {
        const b = shipArr[j];
        if (b.hp <= 0) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const r = a.collisionRadius + b.collisionRadius;
        if (dx * dx + dy * dy > r * r) continue;
        tryDamage(a, 'ship', b.id);
        tryDamage(b, 'ship', a.id);
      }
    }

    return events;
  }

  /**
   * Serialize all ships for network broadcast
   * @returns {Object} - Object mapping id -> serialized ship state
   */
  serializeAll() {
    const result = {};
    this.ships.forEach((ship, id) => {
      result[id] = ship.serialize();
    });
    return result;
  }

  /**
   * Get the count of active ships
   * @returns {number} - Number of ships
   */
  getCount() {
    return this.ships.size;
  }

  /**
   * Get all ship IDs
   * @returns {string[]} - Array of ship IDs
   */
  getAllIds() {
    return Array.from(this.ships.keys());
  }

  /**
   * Iterate over all ships
   * @param {Function} callback - Callback function(ship, id)
   */
  forEach(callback) {
    this.ships.forEach(callback);
  }

  /**
   * Remove ships whose sockets are no longer active
   * @param {Set<string>} activeSocketIds - Set of active socket IDs
   * @returns {string[]} - Array of removed ship IDs
   */
  removeStaleShips(activeSocketIds) {
    const removed = [];
    this.ships.forEach((ship, id) => {
      if (!activeSocketIds.has(id)) {
        this.removeShip(id);
        removed.push(id);
      }
    });
    return removed;
  }

}

module.exports = EntityManager;
