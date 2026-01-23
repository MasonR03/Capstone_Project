/**
 * GameStateManager - Centralized reactive state store
 *
 * Manages all client-side game state with event emission for state changes.
 * Replaces scattered global variables with a single source of truth.
 */

import GameConfig from '../config/GameConfig.js';

class GameStateManager {
  constructor() {
    // Core state
    this._state = {
      // Connection state
      socketId: null,
      myId: null,
      connected: false,

      // Game state
      classChosen: false,
      chosenClassKey: null,
      cameraFollowSet: false,

      // Player data
      clientPlayers: {},      // playerId -> Phaser sprite
      playerNames: {},        // playerId -> player name
      playerNameTexts: {},    // playerId -> Phaser text object

      // Scores
      serverScores: { red: 0, blue: 0 },

      // Local player stats
      localPlayerStats: {
        hp: 100,
        maxHp: 100,
        xp: 0,
        maxXp: 100
      },

      // Stars
      starSprites: [],
      latestStars: [],
      pendingStarPositions: null,

      // Network
      currentPing: 0
    };

    // Event listeners for state changes
    this._listeners = new Map();
  }

  /**
   * Get a state value by key (supports dot notation)
   * @param {string} key - The state key (e.g., 'socketId' or 'localPlayerStats.hp')
   * @returns {*} The state value
   */
  get(key) {
    if (key.includes('.')) {
      return this._getNestedValue(this._state, key);
    }
    return this._state[key];
  }

  /**
   * Set a state value and emit change event
   * @param {string} key - The state key
   * @param {*} value - The new value
   */
  set(key, value) {
    const oldValue = this.get(key);

    if (key.includes('.')) {
      this._setNestedValue(this._state, key, value);
    } else {
      this._state[key] = value;
    }

    this._emit(key, value, oldValue);
  }

  /**
   * Update multiple state values at once
   * @param {Object} partial - Object with key-value pairs to update
   */
  update(partial) {
    Object.keys(partial).forEach(key => {
      this.set(key, partial[key]);
    });
  }

  /**
   * Subscribe to state changes
   * @param {string} key - The state key to watch (or '*' for all changes)
   * @param {Function} callback - Callback function(newValue, oldValue, key)
   * @returns {Function} Unsubscribe function
   */
  on(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => this.off(key, callback);
  }

  /**
   * Unsubscribe from state changes
   * @param {string} key - The state key
   * @param {Function} callback - The callback to remove
   */
  off(key, callback) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).delete(callback);
    }
  }

  /**
   * Emit state change event
   * @private
   */
  _emit(key, newValue, oldValue) {
    // Notify specific key listeners
    if (this._listeners.has(key)) {
      this._listeners.get(key).forEach(cb => cb(newValue, oldValue, key));
    }

    // Notify wildcard listeners
    if (this._listeners.has('*')) {
      this._listeners.get('*').forEach(cb => cb(newValue, oldValue, key));
    }
  }

  /**
   * Get nested value using dot notation
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Set nested value using dot notation
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (current[key] === undefined) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  // =========== Convenience methods ===========

  /**
   * Get the local player's socket ID
   */
  getSocketId() {
    return this._state.socketId;
  }

  /**
   * Get the local player's display ID (name)
   */
  getMyId() {
    return this._state.myId;
  }

  /**
   * Check if a class has been chosen
   */
  isClassChosen() {
    return this._state.classChosen;
  }

  /**
   * Get the chosen class key
   */
  getChosenClassKey() {
    return this._state.chosenClassKey;
  }

  /**
   * Set connection state
   */
  setConnected(socketId, myId) {
    this.update({
      socketId,
      myId,
      connected: true
    });
  }

  /**
   * Set class choice
   */
  setClassChoice(classKey) {
    const safeKey = GameConfig.shipClasses[classKey] ? classKey : GameConfig.defaultClass;
    this.update({
      chosenClassKey: safeKey,
      classChosen: true
    });
  }

  /**
   * Update server scores
   */
  updateScores(scores) {
    this.set('serverScores', scores || { red: 0, blue: 0 });
  }

  /**
   * Update local player stats
   */
  updateLocalPlayerStats(stats) {
    const current = this._state.localPlayerStats;
    this.set('localPlayerStats', {
      hp: stats.hp !== undefined ? stats.hp : current.hp,
      maxHp: stats.maxHp !== undefined ? stats.maxHp : current.maxHp,
      xp: stats.xp !== undefined ? stats.xp : current.xp,
      maxXp: stats.maxXp !== undefined ? stats.maxXp : current.maxXp
    });
  }

  /**
   * Add or update a player sprite reference
   */
  setPlayerSprite(playerId, sprite) {
    this._state.clientPlayers[playerId] = sprite;
    this._emit('clientPlayers', this._state.clientPlayers, null);
  }

  /**
   * Get a player sprite
   */
  getPlayerSprite(playerId) {
    return this._state.clientPlayers[playerId];
  }

  /**
   * Get all player sprites
   */
  getAllPlayerSprites() {
    return this._state.clientPlayers;
  }

  /**
   * Remove a player
   */
  removePlayer(playerId) {
    const sprite = this._state.clientPlayers[playerId];
    if (sprite) {
      sprite.destroy();
      delete this._state.clientPlayers[playerId];
    }

    const nameText = this._state.playerNameTexts[playerId];
    if (nameText) {
      nameText.destroy();
      delete this._state.playerNameTexts[playerId];
    }

    delete this._state.playerNames[playerId];

    this._emit('playerRemoved', playerId, null);
  }

  /**
   * Set player name
   */
  setPlayerName(playerId, name) {
    this._state.playerNames[playerId] = name;
  }

  /**
   * Get player name
   */
  getPlayerName(playerId) {
    return this._state.playerNames[playerId];
  }

  /**
   * Get all player names
   */
  getAllPlayerNames() {
    return this._state.playerNames;
  }

  /**
   * Set player name text object
   */
  setPlayerNameText(playerId, textObj) {
    this._state.playerNameTexts[playerId] = textObj;
  }

  /**
   * Get player name text object
   */
  getPlayerNameText(playerId) {
    return this._state.playerNameTexts[playerId];
  }

  /**
   * Update ping
   */
  setPing(ping) {
    this.set('currentPing', ping);
  }

  /**
   * Get current ping
   */
  getPing() {
    return this._state.currentPing;
  }

  /**
   * Add star sprite
   */
  addStarSprite(sprite) {
    this._state.starSprites.push(sprite);
  }

  /**
   * Get star sprites
   */
  getStarSprites() {
    return this._state.starSprites;
  }

  /**
   * Update star positions from server
   */
  updateStarPositions(starsInfo) {
    this._state.latestStars = starsInfo || this._state.latestStars;

    if (this._state.starSprites.length > 0) {
      (starsInfo || []).forEach((star, index) => {
        if (this._state.starSprites[index]) {
          this._state.starSprites[index].setPosition(star.x, star.y);
        }
      });
      this._state.pendingStarPositions = null;
    } else {
      this._state.pendingStarPositions = starsInfo;
    }

    this._emit('starsUpdated', starsInfo, null);
  }

  /**
   * Apply pending star positions (called when scene is ready)
   */
  applyPendingStarPositions() {
    if (this._state.pendingStarPositions && this._state.starSprites.length > 0) {
      this._state.pendingStarPositions.forEach((star, index) => {
        if (this._state.starSprites[index]) {
          this._state.starSprites[index].setPosition(star.x, star.y);
        }
      });
      this._state.pendingStarPositions = null;
    }
  }

  /**
   * Get latest stars data for minimap
   */
  getLatestStars() {
    return this._state.latestStars;
  }

  /**
   * Set camera follow state
   */
  setCameraFollowSet(value) {
    this.set('cameraFollowSet', value);
  }

  /**
   * Check if camera follow is set
   */
  isCameraFollowSet() {
    return this._state.cameraFollowSet;
  }

  /**
   * Get local player stats
   */
  getLocalPlayerStats() {
    return { ...this._state.localPlayerStats };
  }

  /**
   * Get server scores
   */
  getServerScores() {
    return { ...this._state.serverScores };
  }

  /**
   * Reset state (for reconnection)
   */
  reset() {
    // Clean up sprites
    Object.values(this._state.clientPlayers).forEach(sprite => {
      if (sprite && sprite.destroy) sprite.destroy();
    });
    Object.values(this._state.playerNameTexts).forEach(text => {
      if (text && text.destroy) text.destroy();
    });

    this._state.clientPlayers = {};
    this._state.playerNames = {};
    this._state.playerNameTexts = {};
    this._state.cameraFollowSet = false;
    this._state.connected = false;

    this._emit('reset', null, null);
  }
}

// Create singleton instance
const gameState = new GameStateManager();

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.GameStateManager = GameStateManager;
  window.gameState = gameState;
}

export { GameStateManager };
export default gameState;
