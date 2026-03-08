/**
 * GameStateManager - Centralized reactive state store
 *
 * Manages all client-side game state with event emission for state changes.
 */

import GameConfig from '../config/GameConfig.js';
import { PLAYER_PROGRESS_DEFAULTS, cloneProgress } from '../stats/stats.js';

class GameStateManager {
  constructor() {
    this._state = {
      // Connection
      socketId: null,
      myId: null,
      connected: false,

      // Game
      classChosen: false,
      chosenClassKey: null,
      cameraFollowSet: false,

      // Player refs
      clientPlayers: {},
      playerNames: {},
      playerNameTexts: {},

      // Local stats
      localPlayerStats: {
        hp: 100,
        maxHp: 100,
        xp: 0,
        maxXp: 100
      },

      // Progress
      playerProgress: cloneProgress(PLAYER_PROGRESS_DEFAULTS),

      // Network
      currentPing: 0
    };

    this._listeners = new Map();
  }

  /**
   * Get a state value.
   *
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    if (key.includes('.')) {
      return this._getNestedValue(this._state, key);
    }
    return this._state[key];
  }

  /**
   * Set a state value.
   *
   * @param {string} key
   * @param {*} value
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
   * Update multiple state values.
   *
   * @param {Object} partial
   */
  update(partial) {
    Object.keys(partial).forEach((key) => {
      this.set(key, partial[key]);
    });
  }

  /**
   * Subscribe to state changes.
   *
   * @param {string} key
   * @param {Function} callback
   * @returns {Function}
   */
  on(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }

    this._listeners.get(key).add(callback);
    return () => this.off(key, callback);
  }

  /**
   * Unsubscribe from state changes.
   *
   * @param {string} key
   * @param {Function} callback
   */
  off(key, callback) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).delete(callback);
    }
  }

  /**
   * Emit a state change.
   *
   * @param {string} key
   * @param {*} newValue
   * @param {*} oldValue
   * @private
   */
  _emit(key, newValue, oldValue) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).forEach((cb) => cb(newValue, oldValue, key));
    }

    if (this._listeners.has('*')) {
      this._listeners.get('*').forEach((cb) => cb(newValue, oldValue, key));
    }
  }

  /**
   * Get nested value by path.
   *
   * @param {Object} obj
   * @param {string} path
   * @returns {*}
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Set nested value by path.
   *
   * @param {Object} obj
   * @param {string} path
   * @param {*} value
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

  /**
   * Get the local socket ID.
   *
   * @returns {string|null}
   */
  getSocketId() {
    return this._state.socketId;
  }

  /**
   * Get the display ID.
   *
   * @returns {string|null}
   */
  getMyId() {
    return this._state.myId;
  }

  /**
   * Check if a class is chosen.
   *
   * @returns {boolean}
   */
  isClassChosen() {
    return this._state.classChosen;
  }

  /**
   * Get the chosen class key.
   *
   * @returns {string|null}
   */
  getChosenClassKey() {
    return this._state.chosenClassKey;
  }

  /**
   * Set connection state.
   *
   * @param {string} socketId
   * @param {string} myId
   */
  setConnected(socketId, myId) {
    this.update({
      socketId,
      myId,
      connected: true
    });
  }

  /**
   * Set class choice.
   *
   * @param {string} classKey
   */
  setClassChoice(classKey) {
    const safeKey = GameConfig.shipClasses[classKey] ? classKey : GameConfig.defaultClass;
    this.update({
      chosenClassKey: safeKey,
      classChosen: true
    });
  }

  /**
   * Update local HUD stats.
   *
   * @param {Object} stats
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
   * Set a player sprite.
   *
   * @param {string} playerId
   * @param {*} sprite
   */
  setPlayerSprite(playerId, sprite) {
    this._state.clientPlayers[playerId] = sprite;
    this._emit('clientPlayers', this._state.clientPlayers, null);
  }

  /**
   * Get a player sprite.
   *
   * @param {string} playerId
   * @returns {*}
   */
  getPlayerSprite(playerId) {
    return this._state.clientPlayers[playerId];
  }

  /**
   * Get all player sprites.
   *
   * @returns {Object}
   */
  getAllPlayerSprites() {
    return this._state.clientPlayers;
  }

  /**
   * Remove a player.
   *
   * @param {string} playerId
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
   * Set player name.
   *
   * @param {string} playerId
   * @param {string} name
   */
  setPlayerName(playerId, name) {
    this._state.playerNames[playerId] = name;
  }

  /**
   * Get player name.
   *
   * @param {string} playerId
   * @returns {string|undefined}
   */
  getPlayerName(playerId) {
    return this._state.playerNames[playerId];
  }

  /**
   * Get all player names.
   *
   * @returns {Object}
   */
  getAllPlayerNames() {
    return this._state.playerNames;
  }

  /**
   * Set player name text object.
   *
   * @param {string} playerId
   * @param {*} textObj
   */
  setPlayerNameText(playerId, textObj) {
    this._state.playerNameTexts[playerId] = textObj;
  }

  /**
   * Get player name text object.
   *
   * @param {string} playerId
   * @returns {*}
   */
  getPlayerNameText(playerId) {
    return this._state.playerNameTexts[playerId];
  }

  /**
   * Set ping.
   *
   * @param {number} ping
   */
  setPing(ping) {
    this.set('currentPing', ping);
  }

  /**
   * Get ping.
   *
   * @returns {number}
   */
  getPing() {
    return this._state.currentPing;
  }

  /**
   * Set camera follow state.
   *
   * @param {boolean} value
   */
  setCameraFollowSet(value) {
    this.set('cameraFollowSet', value);
  }

  /**
   * Check if camera follow is set.
   *
   * @returns {boolean}
   */
  isCameraFollowSet() {
    return this._state.cameraFollowSet;
  }

  /**
   * Get local HUD stats.
   *
   * @returns {Object}
   */
  getLocalPlayerStats() {
    return { ...this._state.localPlayerStats };
  }

  /**
   * Set player progress.
   *
   * @param {Object} progress
   */
  setPlayerProgress(progress) {
    this.set('playerProgress', cloneProgress(progress));
  }

  /**
   * Get player progress.
   *
   * @returns {Object}
   */
  getPlayerProgress() {
    return cloneProgress(this._state.playerProgress);
  }

  /**
   * Reset state.
   */
  reset() {
    Object.values(this._state.clientPlayers).forEach((sprite) => {
      if (sprite && sprite.destroy) sprite.destroy();
    });

    Object.values(this._state.playerNameTexts).forEach((text) => {
      if (text && text.destroy) text.destroy();
    });

    this._state.clientPlayers = {};
    this._state.playerNames = {};
    this._state.playerNameTexts = {};
    this._state.cameraFollowSet = false;
    this._state.connected = false;
    this._state.playerProgress = cloneProgress(PLAYER_PROGRESS_DEFAULTS);

    this._emit('reset', null, null);
  }
}

const gameState = new GameStateManager();

if (typeof window !== 'undefined') {
  window.GameStateManager = GameStateManager;
  window.gameState = gameState;
}

export { GameStateManager };
export default gameState;