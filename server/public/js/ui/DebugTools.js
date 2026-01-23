/**
 * DebugTools - Debug panel component
 *
 * Displays player position, velocity, ping, and other debug information.
 * Togglable via button in the UI.
 */

class DebugTools {
  /**
   * Create a new DebugTools instance
   */
  constructor() {
    this.visible = false;
    this.updateInterval = null;
    this.game = null;
    this.getPlayerCallback = null;
    this.debugGridGraphics = null;

    // DOM element references
    this.debugButton = null;
    this.debugPanel = null;
    this.elements = {};
  }

  /**
   * Check if running locally
   */
  isRunningLocally() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname === '' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.');
  }

  /**
   * Initialize debug tools
   * @param {Phaser.Game} game - The Phaser game instance
   * @param {Function} getPlayer - Callback to get player info
   * @param {Phaser.Graphics} gridGraphics - Optional grid graphics to toggle
   */
  init(game, getPlayer, gridGraphics = null) {
    this.game = game;
    this.getPlayerCallback = getPlayer;
    this.debugGridGraphics = gridGraphics;

    // Get DOM elements
    this.debugButton = document.getElementById('debug-button');
    this.debugPanel = document.getElementById('debug-panel');

    if (!this.debugButton || !this.debugPanel) {
      console.warn('DebugTools: Required DOM elements not found');
      return;
    }

    // Cache element references
    this.elements = {
      posX: document.getElementById('pos-x'),
      posY: document.getElementById('pos-y'),
      camX: document.getElementById('cam-x'),
      camY: document.getElementById('cam-y'),
      velocity: document.getElementById('velocity'),
      ping: document.getElementById('ping'),
      playerCount: document.getElementById('player-count'),
      playerNamesSection: document.getElementById('player-names-section'),
      playerNamesList: document.getElementById('player-names-list')
    };

    // Show the debug button
    this.debugButton.style.display = 'block';

    // Check localStorage for saved state
    const savedState = localStorage.getItem('debugPanelVisible');
    if (savedState === 'true') {
      this.show();
    }

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Toggle on button click
    this.debugButton.addEventListener('click', () => this.toggle());

    // Prevent spacebar from triggering button
    this.debugButton.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
      }
    });

    // Prevent spacebar at document level from focusing button
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement === this.debugButton) {
        e.preventDefault();
        this.debugButton.blur();
      }
    });
  }

  /**
   * Toggle debug panel visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show the debug panel
   */
  show() {
    this.visible = true;
    this.debugPanel.style.display = 'block';
    localStorage.setItem('debugPanelVisible', 'true');

    // Show gridlines if available
    if (this.debugGridGraphics) {
      this.debugGridGraphics.setVisible(true);
    }

    this._startUpdates();
  }

  /**
   * Hide the debug panel
   */
  hide() {
    this.visible = false;
    this.debugPanel.style.display = 'none';
    localStorage.setItem('debugPanelVisible', 'false');

    // Hide gridlines if available
    if (this.debugGridGraphics) {
      this.debugGridGraphics.setVisible(false);
    }

    this._stopUpdates();
  }

  /**
   * Start position update interval
   * @private
   */
  _startUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Update at 20Hz (50ms intervals)
    this.updateInterval = setInterval(() => this._update(), 50);
  }

  /**
   * Stop position update interval
   * @private
   */
  _stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update the debug display
   * @private
   */
  _update() {
    const el = this.elements;

    // Get active scene
    const scene = this.game?.scene?.scenes?.[0];

    // Update camera position
    if (scene && scene.cameras && scene.cameras.main) {
      const camera = scene.cameras.main;
      el.camX.textContent = Math.round(camera.scrollX);
      el.camY.textContent = Math.round(camera.scrollY);
    } else {
      el.camX.textContent = '-';
      el.camY.textContent = '-';
    }

    // Get player info from callback
    let playerInfo = this.getPlayerCallback ? this.getPlayerCallback() : null;

    // Fallback: pull from scene entity manager if callback doesn't provide a player
    if ((!playerInfo || !playerInfo.player) && scene && scene.entityManager) {
      const localShip = scene.entityManager.getLocalShip ? scene.entityManager.getLocalShip() : null;
      const shipsMap = scene.entityManager.ships || new Map();
      const allShips = shipsMap instanceof Map ? Object.fromEntries(shipsMap) : shipsMap;

      playerInfo = {
        player: localShip || null,
        allPlayers: allShips || {},
        playerNames: Object.keys(allShips || {}).reduce((acc, id) => {
          const ship = allShips[id];
          acc[id] = ship && ship.playerName ? ship.playerName : id;
          return acc;
        }, {})
      };
    }

    // Update player count and names
    if (playerInfo && playerInfo.allPlayers) {
      const allPlayers = playerInfo.allPlayers;
      const playerCount = Object.keys(allPlayers).length;
      el.playerCount.textContent = playerCount;

      // Display player names if available
      if (playerInfo.playerNames && playerCount > 0) {
        const namesList = Object.entries(playerInfo.playerNames)
          .map(([id, name]) => `• ${name}`)
          .join('<br>');

        if (namesList) {
          el.playerNamesList.innerHTML = namesList;
          el.playerNamesSection.style.display = 'block';
        } else {
          el.playerNamesSection.style.display = 'none';
        }
      } else {
        el.playerNamesSection.style.display = 'none';
      }
    } else {
      el.playerCount.textContent = '0';
      el.playerNamesSection.style.display = 'none';
    }

    // Update player position and velocity
    if (playerInfo && playerInfo.player) {
      const player = playerInfo.player;

      // Use predicted position/velocity for ClientShip (local player)
      if (player.predicted) {
        el.posX.textContent = Math.round(player.predicted.x);
        el.posY.textContent = Math.round(player.predicted.y);
        const velX = player.predicted.vx || 0;
        const velY = player.predicted.vy || 0;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        el.velocity.textContent = speed;
      } else if (player.serverState) {
        // ClientShip without prediction initialized
        el.posX.textContent = Math.round(player.serverState.x);
        el.posY.textContent = Math.round(player.serverState.y);
        const velX = player.serverState.vx || 0;
        const velY = player.serverState.vy || 0;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        el.velocity.textContent = speed;
      } else if (player.body) {
        // Fallback for Phaser physics body
        el.posX.textContent = Math.round(player.x);
        el.posY.textContent = Math.round(player.y);
        const velX = player.body.velocity.x;
        const velY = player.body.velocity.y;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        el.velocity.textContent = speed;
      } else if (player.velocityX !== undefined || player.velocityY !== undefined) {
        // Use server-provided velocity stored on sprite
        el.posX.textContent = Math.round(player.x);
        el.posY.textContent = Math.round(player.y);
        const velX = player.velocityX || 0;
        const velY = player.velocityY || 0;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        el.velocity.textContent = speed;
      } else {
        el.posX.textContent = Math.round(player.x);
        el.posY.textContent = Math.round(player.y);
        el.velocity.textContent = '0';
      }
    } else {
      el.posX.textContent = '-';
      el.posY.textContent = '-';
      el.velocity.textContent = '-';
    }

    // Update ping display
    if (window.getCurrentPing) {
      el.ping.textContent = window.getCurrentPing();
    } else if (window.gameState) {
      el.ping.textContent = window.gameState.getPing();
    } else {
      el.ping.textContent = '-';
    }
  }

  /**
   * Destroy debug tools
   */
  destroy() {
    this._stopUpdates();
    this.game = null;
    this.getPlayerCallback = null;
    this.debugGridGraphics = null;
  }
}

// Create singleton instance
const debugTools = new DebugTools();

// Backward compatibility: expose as DebugTools object
if (typeof window !== 'undefined') {
  window.DebugTools = {
    init: (game, getPlayer, gridGraphics) => debugTools.init(game, getPlayer, gridGraphics),
    isRunningLocally: () => debugTools.isRunningLocally()
  };
  window.debugToolsInstance = debugTools;
}

export { DebugTools };
export default debugTools;
