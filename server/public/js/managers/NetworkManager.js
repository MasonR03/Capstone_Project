/**
 * NetworkManager - Socket.io communication wrapper
 *
 * Handles all socket.io communication including connection management,
 * event handling, ping measurement, and input emission.
 */

import GameConfig from '../config/GameConfig.js';
import gameState from './GameStateManager.js';

class NetworkManager {
  constructor() {
    this.socket = null;
    this.pingInterval = null;
    this._eventHandlers = new Map();
    this._onConnectCallbacks = [];
    this._onDisconnectCallbacks = [];
  }

  /**
   * Initialize and connect to the server
   * @param {string} playerName - The player's display name
   * @returns {Promise} Resolves when connected
   */
  connect(playerName) {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        console.warn('NetworkManager: Already connected');
        resolve(this.socket);
        return;
      }

      // Create socket connection
      this.socket = io({ transports: ['websocket'] });

      this.socket.on('connect', () => {
        const socketId = this.socket.id;
        const myId = playerName || socketId;

        console.log('✅ Connected to server');
        console.log('🆔 My player name:', myId);
        console.log('🔌 Socket ID:', socketId);

        // Update state
        gameState.setConnected(socketId, myId);

        // Start ping measurement
        this._startPingMeasurement();

        // If class already chosen, send it
        if (gameState.isClassChosen()) {
          this.emitChooseClass(gameState.getChosenClassKey());
        }

        // Notify callbacks
        this._onConnectCallbacks.forEach(cb => cb(socketId, myId));

        resolve(this.socket);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server:', reason);
        this._stopPingMeasurement();
        this._onDisconnectCallbacks.forEach(cb => cb(reason));
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        if (error.message === 'Authentication required') {
          window.location.reload();
          return;
        }
        reject(error);
      });

      // Set up default event handlers
      this._setupDefaultHandlers();

      // Connection timeout
      setTimeout(() => {
        if (!this.socket.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this._stopPingMeasurement();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }

  /**
   * Emit an event to the server
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('NetworkManager: Cannot emit, not connected');
    }
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   */
  on(event, callback) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event).add(callback);

    // If socket exists, also register directly
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event handler to remove
   */
  off(event, callback) {
    if (this._eventHandlers.has(event)) {
      this._eventHandlers.get(event).delete(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Register a connection callback
   * @param {Function} callback - Called with (socketId, myId)
   */
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
  }

  /**
   * Register a disconnection callback
   * @param {Function} callback - Called with (reason)
   */
  onDisconnect(callback) {
    this._onDisconnectCallbacks.push(callback);
  }

  /**
   * Emit player input
   * @param {Object} input - Input state {left, right, up, down}
   */
  emitPlayerInput(input) {
    this.emit('playerInput', {
      left: !!input.left,
      right: !!input.right,
      up: !!input.up,
      down: !!input.down,
      boost: !!input.boost
    });
  }

  /**
   * Emit a shoot event to the server
   */
  emitShoot() {
    this.emit('playerShoot');
  }

  /**
   * Request the current authoritative collectible star list.
   */
  emitRequestCollectibleStars() {
    this.emit('requestCollectibleStars');
  }

  /**
   * Request collection of an authoritative collectible star.
   *
   * @param {string} starId
   */
  emitCollectibleStar(starId) {
    if (!starId) return;
    this.emit('collectCollectibleStar', { starId });
  }

  /**
   * Notify the server that the local player gained upgrade points.
   *
   * @param {number} pointsGained
   * @param {number|null} level
   */
  emitPlayerLevelUp(pointsGained = 1, level = null) {
    const safePoints = Math.max(1, Math.floor(Number(pointsGained) || 1));
    const safeLevel = Number.isFinite(Number(level))
      ? Math.max(1, Math.floor(Number(level)))
      : null;

    this.emit('playerLevelUp', {
      pointsGained: safePoints,
      level: safeLevel
    });
  }

  /**
   * Emit class choice.
   *
   * @param {string|Object} payload
   */
  emitChooseClass(payload) {
    let requestedClassKey = null;
    let progress = null;

    if (typeof payload === 'string') {
      requestedClassKey = payload;
    } else if (payload && typeof payload === 'object') {
      requestedClassKey = payload.classKey;
      progress = payload.progress || null;
    }

    const safeKey = GameConfig.shipClasses[requestedClassKey]
      ? requestedClassKey
      : GameConfig.defaultClass;

    const socketId = gameState.getSocketId();
    const myId = gameState.getMyId();

    const finalPayload = {
      classKey: safeKey,
      playerId: socketId,
      playerName: myId
    };

    if (progress) {
      finalPayload.progress = progress;
    }

    this.emit('chooseClass', finalPayload);
    gameState.setClassChoice(safeKey);
  }

  /**
   * Get current ping
   */
  getPing() {
    return gameState.getPing();
  }

  /**
   * Set up default event handlers for state updates
   * @private
   */
  _setupDefaultHandlers() {
    // No default gameplay UI channels are required here currently.
  }

  /**
   * Start ping measurement
   * @private
   */
  _startPingMeasurement() {
    this._stopPingMeasurement();

    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        const start = Date.now();
        this.socket.emit('ping', () => {
          const ping = Date.now() - start;
          gameState.setPing(ping);
        });
      }
    }, GameConfig.network.pingInterval);
  }

  /**
   * Stop ping measurement
   * @private
   */
  _stopPingMeasurement() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Get the socket instance (for direct access if needed)
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Get the socket ID
   */
  getSocketId() {
    return this.socket ? this.socket.id : null;
  }
}

// Create singleton instance
const networkManager = new NetworkManager();

// Expose ping getter for backward compatibility
if (typeof window !== 'undefined') {
  window.NetworkManager = NetworkManager;
  window.networkManager = networkManager;
  window.getCurrentPing = () => networkManager.getPing();
}

export { NetworkManager };
export default networkManager;
