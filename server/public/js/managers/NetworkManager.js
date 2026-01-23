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

        // Send player name
        this.emit('setPlayerName', myId);

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
      down: !!input.down
    });
  }

  /**
   * Emit class choice
   * @param {string} classKey - The chosen class key
   */
  emitChooseClass(classKey) {
    const safeKey = GameConfig.shipClasses[classKey] ? classKey : GameConfig.defaultClass;
    const socketId = gameState.getSocketId();
    const myId = gameState.getMyId();

    // Send the event
    this.emit('chooseClass', { classKey: safeKey });

    // Also send a richer payload (harmless if server ignores)
    this.emit('chooseClass', { classKey: safeKey, playerId: socketId, playerName: myId });

    // Update state
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
    // Stars location
    this.socket.on('starsLocation', (starsInfo) => {
      console.log('📍 Star locations received:', starsInfo);
      gameState.updateStarPositions(starsInfo);
    });

    // Score updates
    this.socket.on('updateScore', (scores) => {
      gameState.updateScores(scores);
    });
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
