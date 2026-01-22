/**
 * ClientEntityManager - Manages client-side ship entities
 *
 * Handles ship creation, destruction, updates, and provides
 * methods for rendering and UI updates.
 */
class ClientEntityManager {
  /**
   * Create a new ClientEntityManager
   * @param {Phaser.Scene} scene - The Phaser scene
   */
  constructor(scene) {
    this.scene = scene;
    this.ships = new Map(); // id -> ClientShip
    this.localPlayerId = null;
  }

  /**
   * Set the local player ID
   * @param {string} id - The local player's ID
   */
  setLocalPlayer(id) {
    this.localPlayerId = id;
  }

  /**
   * Get the local player's ship
   * @returns {ClientShip|null}
   */
  getLocalShip() {
    return this.ships.get(this.localPlayerId) || null;
  }

  /**
   * Check if a ship is the local player
   * @param {string} id - Ship ID to check
   * @returns {boolean}
   */
  isLocalPlayer(id) {
    return id === this.localPlayerId;
  }

  /**
   * Create or update a ship from server state
   * @param {Object} serverState - State from server
   * @returns {ClientShip} - The created or updated ship
   */
  addOrUpdateShip(serverState) {
    const id = serverState.playerId;
    let ship = this.ships.get(id);

    if (!ship) {
      // Create new ship
      ship = new ClientShip(this.scene, id, serverState);
      this.ships.set(id, ship);
      console.log('Created ship for player:', ship.getDisplayName());
    } else {
      // Update existing ship
      ship.updateFromServer(serverState);
    }

    return ship;
  }

  /**
   * Get a ship by ID
   * @param {string} id - Ship ID
   * @returns {ClientShip|undefined}
   */
  getShip(id) {
    return this.ships.get(id);
  }

  /**
   * Check if a ship exists
   * @param {string} id - Ship ID
   * @returns {boolean}
   */
  hasShip(id) {
    return this.ships.has(id);
  }

  /**
   * Remove a ship by ID
   * @param {string} id - Ship ID
   * @returns {boolean} - True if ship was removed
   */
  removeShip(id) {
    const ship = this.ships.get(id);
    if (ship) {
      ship.destroy();
      this.ships.delete(id);
      console.log('Removed ship:', id);
      return true;
    }
    return false;
  }

  /**
   * Process server player updates
   * @param {Object} serverPlayers - Players object from server
   * @param {Object} callbacks - Optional callbacks { onLocalPlayerUpdate }
   */
  processServerUpdate(serverPlayers, callbacks = {}) {
    Object.keys(serverPlayers).forEach((id) => {
      const serverState = serverPlayers[id];

      // Create ship if it doesn't exist
      if (!this.ships.has(id)) {
        const ship = this.addOrUpdateShip(serverState);

        // Check if this is the local player
        if (this.isLocalPlayer(id)) {
          console.log('Found local player ship:', ship.getDisplayName());
        }
      }

      const ship = this.ships.get(id);
      if (!ship) return;

      // Update server state
      ship.updateFromServer(serverState);

      // Handle local player prediction/reconciliation
      if (this.isLocalPlayer(id)) {
        if (!ship.predictionInitialized) {
          ship.initPrediction(serverState);
        } else {
          ship.reconcile(serverState);
        }

        // Callback for local player updates (HP, XP, etc.)
        if (callbacks.onLocalPlayerUpdate) {
          callbacks.onLocalPlayerUpdate(serverState);
        }
      }
    });
  }

  /**
   * Update all ships (interpolation for remote, prediction applied separately)
   */
  updateAll() {
    this.ships.forEach((ship, id) => {
      if (!this.isLocalPlayer(id)) {
        // Remote players: interpolate toward server state
        ship.interpolate();
      }
      // Local player updates are handled via applyPrediction() called separately
    });
  }

  /**
   * Apply prediction for local player
   * @param {Object} input - Current input state
   * @param {number} dt - Delta time in seconds
   */
  applyLocalPrediction(input, dt) {
    const localShip = this.getLocalShip();
    if (localShip && localShip.predictionInitialized) {
      localShip.applyPrediction(input, dt);
    }
  }

  /**
   * Get the count of ships
   * @returns {number}
   */
  getCount() {
    return this.ships.size;
  }

  /**
   * Get all ship IDs
   * @returns {string[]}
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
   * Get ships data for minimap
   * @returns {Object} - Object mapping id -> position data
   */
  getMinimapData() {
    const data = {};
    this.ships.forEach((ship, id) => {
      const pos = ship.getPosition();
      data[id] = {
        x: pos.x,
        y: pos.y,
        team: ship.team,
        playerName: ship.playerName
      };
    });
    return data;
  }

  /**
   * Get a sprite by ID (for backward compatibility)
   * @param {string} id - Ship ID
   * @returns {Phaser.GameObjects.Sprite|null}
   */
  getSprite(id) {
    const ship = this.ships.get(id);
    return ship ? ship.sprite : null;
  }

  /**
   * Set camera to follow local player
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   * @returns {boolean} - True if camera was set
   */
  setCameraToLocalPlayer(camera) {
    const localShip = this.getLocalShip();
    if (localShip) {
      localShip.setCamera(camera);
      return true;
    }
    return false;
  }

  /**
   * Initialize local player from currentPlayers event
   * @param {Object} players - Players object from server
   * @param {string} localId - Local player ID
   * @param {Phaser.Cameras.Scene2D.Camera} camera - Camera to follow
   */
  initializeFromServer(players, localId, camera) {
    this.setLocalPlayer(localId);

    Object.keys(players).forEach((id) => {
      const ship = this.addOrUpdateShip(players[id]);

      if (id === localId) {
        ship.initPrediction(players[id]);
        ship.setCamera(camera);
        console.log('Initialized local player:', ship.getDisplayName());
      }
    });
  }
}

// Export for use in browser (attached to window) and potential module systems
if (typeof window !== 'undefined') {
  window.ClientEntityManager = ClientEntityManager;
}
