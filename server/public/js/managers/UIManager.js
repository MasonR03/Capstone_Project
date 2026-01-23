/**
 * UIManager - Orchestrates all UI components
 *
 * Manages HUD, Minimap, LevelPanel, ClassPicker, and DebugTools.
 * Provides a unified interface for UI updates.
 */

import GameConfig from '../config/GameConfig.js';
import gameState from './GameStateManager.js';
import HUD from '../ui/HUD.js';
import LevelPanel from '../ui/LevelPanel.js';
import Minimap from '../ui/minimap.js';
import { ClassPicker } from '../ui/ClassPicker.js';
import debugTools from '../ui/DebugTools.js';

class UIManager {
  /**
   * Create a new UIManager
   */
  constructor() {
    this.scene = null;
    this.game = null;

    // UI components
    this.hud = null;
    this.minimap = null;
    this.levelPanel = null;
    this.classPicker = null;

    // Configuration
    this.worldConfig = {
      width: GameConfig.world.width,
      height: GameConfig.world.height
    };
  }

  /**
   * Initialize the UI manager with a Phaser scene
   * @param {Phaser.Scene} scene - The Phaser scene
   * @param {Phaser.Game} game - The Phaser game instance
   * @param {Object} options - Configuration options
   */
  init(scene, game, options = {}) {
    this.scene = scene;
    this.game = game;

    if (options.world) {
      this.worldConfig = options.world;
    }

    // Create HUD
    this.hud = new HUD(scene);

    // Create Minimap
    this.minimap = new Minimap(scene, {
      worldW: this.worldConfig.width,
      worldH: this.worldConfig.height,
      size: GameConfig.minimap.size,
      radius: GameConfig.minimap.radius,
      margin: GameConfig.minimap.margin
    });

    // Create Level Panel
    this.levelPanel = new LevelPanel(scene);

    // Initialize debug tools
    debugTools.init(game, () => this._getDebugPlayerInfo());

    console.log('UIManager initialized');

    return this;
  }

  /**
   * Open the class picker
   * @param {Function} onPick - Callback when class is picked
   * @returns {ClassPicker} The class picker instance
   */
  openClassPicker(onPick) {
    if (this.classPicker && this.classPicker.isVisible()) {
      return this.classPicker;
    }

    this.classPicker = new ClassPicker(this.scene, (classKey) => {
      this.classPicker = null;
      if (onPick) onPick(classKey);
    });

    return this.classPicker;
  }

  /**
   * Update scores display
   * @param {Object} scores - { red, blue }
   */
  updateScores(scores) {
    if (this.hud) {
      this.hud.updateScores(scores);
    }
  }

  /**
   * Update HP and XP display
   * @param {Object} stats - { hp, maxHp, xp, maxXp }
   */
  updateHpXp(stats) {
    if (this.hud) {
      this.hud.updateHpXp(stats);
    }
  }

  /**
   * Update minimap
   * @param {Object} data - { players, myId, stars }
   */
  updateMinimap(data) {
    if (this.minimap) {
      this.minimap.update(data.players, data.stars, data.myId);
    }
  }

  /**
   * Tick - call each frame to update UI positions
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   */
  tick(camera) {
    if (this.hud) {
      this.hud.tick(camera);
    }
    if (this.minimap) {
      this.minimap.anchor();
    }
    if (this.levelPanel) {
      this.levelPanel.tick(camera);
    }
  }

  /**
   * Get player info for debug tools
   * @private
   */
  _getDebugPlayerInfo() {
    const socketId = gameState.getSocketId();
    const mySprite = gameState.getPlayerSprite(socketId);

    return {
      player: mySprite,
      allPlayers: gameState.getAllPlayerSprites(),
      playerNames: gameState.getAllPlayerNames()
    };
  }

  /**
   * Open level panel
   */
  openLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.open();
    }
  }

  /**
   * Close level panel
   */
  closeLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.close();
    }
  }

  /**
   * Toggle level panel
   */
  toggleLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.toggle();
    }
  }

  /**
   * Show debug panel
   */
  showDebug() {
    debugTools.show();
  }

  /**
   * Hide debug panel
   */
  hideDebug() {
    debugTools.hide();
  }

  /**
   * Toggle debug panel
   */
  toggleDebug() {
    debugTools.toggle();
  }

  /**
   * Destroy all UI components
   */
  destroy() {
    if (this.hud) {
      this.hud.destroy();
      this.hud = null;
    }
    if (this.minimap) {
      this.minimap.destroy();
      this.minimap = null;
    }
    if (this.levelPanel) {
      this.levelPanel.destroy();
      this.levelPanel = null;
    }
    if (this.classPicker) {
      this.classPicker.close();
      this.classPicker = null;
    }
    debugTools.destroy();
  }
}

// Create singleton instance
const uiManager = new UIManager();

// Backward compatibility: expose window.UI interface
if (typeof window !== 'undefined') {
  window.UIManager = UIManager;
  window.uiManager = uiManager;

  // Legacy UI interface for existing code
  window.UI = {
    init: (scene, options = {}) => {
      // This is called from clientGame.js with (scene, { world, minimap })
      // We need the game instance too, so grab it from scene
      const game = scene.game;
      uiManager.init(scene, game, options);
      return window.UI; // Return self for chaining
    },
    updateScores: (scores) => uiManager.updateScores(scores),
    updateHpXp: (stats) => uiManager.updateHpXp(stats),
    tick: (camera) => uiManager.tick(camera),
    updateMinimap: (data) => uiManager.updateMinimap(data)
  };
}

export { UIManager };
export default uiManager;
