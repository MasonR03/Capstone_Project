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

  /**
   * Set up collision detection between a ship and star bodies
   * @param {string} shipId - The ship ID
   * @param {Array} starBodies - Array of star physics bodies
   * @param {Function} collisionHandler - Callback for collision (playerBody, starBody)
   */
  setupStarCollisions(shipId, starBodies, collisionHandler) {
    const ship = this.ships.get(shipId);
    if (!ship || !ship.body) return;

    starBodies.forEach((starBody) => {
      this.physics.add.overlap(ship.body, starBody, collisionHandler);
    });
  }
}

module.exports = EntityManager;
