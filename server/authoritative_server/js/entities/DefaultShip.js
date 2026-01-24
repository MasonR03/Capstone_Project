/**
 * DefaultShip - Player-controlled ship
 *
 * Extends the base Ship class with player-specific functionality:
 * - Socket ID tracking for network communication
 * - Player name management
 * - Input sequence tracking for client-side prediction reconciliation
 */
const Ship = require('./Ship');

class DefaultShip extends Ship {
  /**
   * Create a new player ship
   * @param {string} socketId - The socket.id of the player
   * @param {number} x - Initial X position
   * @param {number} y - Initial Y position
   * @param {Object} config - Configuration options
   * @param {string} config.playerName - Display name for the player
   * @param {string} config.team - Team assignment ('red' or 'blue')
   * @param {number} config.maxSpeed - Maximum velocity
   * @param {number} config.acceleration - Acceleration rate
   * @param {number} config.angularSpeed - Rotation speed (rad/s)
   * @param {number} config.dragFactor - Drag coefficient (0-1)
   */
  constructor(socketId, x, y, config = {}) {
    super(socketId, x, y, config);

    // Player-specific properties
    this.socketId = socketId;
    this.playerName = config.playerName || null;
    this.lastInputSeq = 0; // Track last processed input sequence for reconciliation
  }

  /**
   * Handle input from the player's socket
   * @param {Object} input - Input state object
   * @param {boolean} input.left - Left key pressed
   * @param {boolean} input.right - Right key pressed
   * @param {boolean} input.up - Up key pressed
   * @param {boolean} input.down - Down key pressed
   * @param {number} input.seq - Input sequence number (optional)
   */
  handleInput(input) {
    this.input = {
      left: input.left || false,
      right: input.right || false,
      up: input.up || false,
      down: input.down || false
    };

    // Track input sequence for client-side prediction reconciliation
    if (input.seq !== undefined) {
      this.lastInputSeq = input.seq;
    }
  }

  /**
   * Set the player's display name
   * @param {string} name - The display name
   */
  setPlayerName(name) {
    if (name) {
      this.playerName = name;
    }
  }

  /**
   * Get the display name (falls back to socket ID)
   * @returns {string} - The display name or abbreviated socket ID
   */
  getDisplayName() {
    return this.playerName || this.socketId.substring(0, 8);
  }

  /**
   * Serialize ship state for network transmission
   * Extends base serialization with player-specific fields
   * @returns {Object} - Ship state object
   */
  serialize() {
    const base = super.serialize();
    return {
      ...base,
      playerName: this.playerName,
      lastInputSeq: this.lastInputSeq,
      input: { ...this.input }
    };
  }
}

module.exports = DefaultShip;
