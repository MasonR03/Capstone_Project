/**
 * Main Entry Point - Boot sequence orchestrator
 *
 * Waits for login, then initializes managers and starts the Phaser game.
 * This is the thin orchestrator that wires everything together.
 */

import GameConfig from './config/GameConfig.js';
import gameState from './managers/GameStateManager.js';
import networkManager from './managers/NetworkManager.js';
import inputManager from './managers/InputManager.js';
import uiManager from './managers/UIManager.js';
import GameScene from './scenes/GameScene.js';

// Expose managers globally for backward compatibility and debugging
window.GameConfig = GameConfig;
window.gameState = gameState;
window.networkManager = networkManager;
window.inputManager = inputManager;
window.uiManager = uiManager;
window.GameScene = GameScene;

// Expose getCurrentPing for debug tools
window.getCurrentPing = () => networkManager.getPing();

// Game instance
let game = null;

/**
 * Initialize the socket connection
 * @param {string} playerName - The player's display name
 * @returns {Promise} Resolves when connected
 */
async function initializeSocket(playerName) {
  try {
    await networkManager.connect(playerName);
    console.log('🎮 Socket connected successfully');
    return true;
  } catch (error) {
    console.error('Socket connection failed:', error);
    return false;
  }
}

/**
 * Initialize the Phaser game
 * @returns {Phaser.Game} The game instance
 */
function initializeGame() {
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: GameConfig.phaser.backgroundColor,
    physics: GameConfig.phaser.physics,
    scene: GameScene
  };

  game = new Phaser.Game(config);
  window.game = game;

  // Debounced resize handler — keeps canvas filling the viewport
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (!game) return;
      game.resize(window.innerWidth, window.innerHeight);
      const scene = game.scene.getScene('GameScene');
      if (scene && scene.handleResize) {
        scene.handleResize(window.innerWidth, window.innerHeight);
      }
    }, 100);
  });

  console.log('🎮 Phaser game initialized');
  return game;
}

/**
 * Boot sequence - coordinates socket connection and game initialization
 */
async function boot() {
  console.log('🚀 Starting boot sequence...');

  // Check if login is complete
  const checkLogin = () => {
    return typeof window.loginComplete !== 'undefined' &&
           window.loginComplete === true &&
           typeof window.playerName !== 'undefined' &&
           window.playerName;
  };

  // Wait for login with polling (no timeout — auth is required)
  const waitForLogin = () => {
    return new Promise((resolve) => {
      const loginCheckInterval = setInterval(() => {
        if (checkLogin()) {
          clearInterval(loginCheckInterval);
          resolve(window.playerName);
        }
      }, 100);
    });
  };

  // Wait for login
  const playerName = await waitForLogin();
  console.log('🎮 Login complete. Player:', playerName);

  // Initialize socket connection first
  console.log('🔌 Connecting to server...');
  const connected = await initializeSocket(playerName);

  if (!connected) {
    console.warn('⚠️ Failed to connect, starting game anyway');
  }

  // Initialize game after socket is ready
  console.log('🎮 Initializing Phaser game...');
  initializeGame();
}

// Start boot sequence when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Export for potential module usage
export { game, boot, initializeSocket, initializeGame };
