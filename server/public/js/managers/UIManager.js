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
import statsTools from '../ui/StatsTools.js';
import { PLAYER_PROGRESS_DEFAULTS, cloneProgress } from '../stats/stats.js';

class UIManager {
  /**
   * Create a new UIManager.
   */
  constructor() {
    this.scene = null;
    this.game = null;

    // UI components
    this.hud = null;
    this.minimap = null;
    this.levelPanel = null;
    this.classPicker = null;

    // Config
    this.worldConfig = {
      width: GameConfig.world.width,
      height: GameConfig.world.height
    };

    // Progress
    this.progress = cloneProgress(PLAYER_PROGRESS_DEFAULTS);
  }

  /**
   * Initialize the UI manager.
   *
   * @param {Phaser.Scene} scene
   * @param {Phaser.Game} game
   * @param {Object} options
   * @returns {UIManager}
   */
  init(scene, game, options = {}) {
    this.scene = scene;
    this.game = game;

    if (options.world) {
      this.worldConfig = options.world;
    }

    if (options.progress) {
      this.progress = cloneProgress(options.progress);
    }

    // Create HUD
    if (typeof HUD === 'function') {
      this.hud = new HUD(scene);
    } else {
      console.error('UIManager: HUD is not a constructor');
    }

    // Create Minimap
    if (typeof Minimap === 'function') {
      this.minimap = new Minimap(scene, {
        worldW: this.worldConfig.width,
        worldH: this.worldConfig.height,
        size: GameConfig.minimap.size,
        radius: GameConfig.minimap.radius,
        margin: GameConfig.minimap.margin
      });
    } else {
      console.error('UIManager: Minimap is not a constructor');
    }

    // Create Level Panel
    if (typeof LevelPanel === 'function') {
      this.levelPanel = new LevelPanel(scene, {
        progress: this.progress,
        onChange: (progress) => {
          this.progress = cloneProgress(progress);
          gameState.setPlayerProgress(this.progress);

          if (this.progress.selectedShip) {
            gameState.setClassChoice(this.progress.selectedShip);
          }

          if (this.classPicker && this.classPicker.isVisible()) {
            this.classPicker.setProgress(this.progress);
          }

          this._syncHudWithState();
        }
      });
    } else {
      console.error('UIManager: LevelPanel is not a constructor');
    }

    debugTools.init(game, () => this._getDebugPlayerInfo());
    statsTools.init(game);

    this._syncHudWithState();

    console.log('UIManager initialized');
    return this;
  }

  /**
   * Get the active ship key.
   *
   * @returns {string}
   * @private
   */
  _getActiveShipKey() {
    return this.progress?.selectedShip || 'starter';
  }

  /**
   * Get the active ship progress.
   *
   * @returns {Object}
   * @private
   */
  _getActiveShipProgress() {
    const shipKey = this._getActiveShipKey();

    return this.progress?.shipProgress?.[shipKey] || {
      level: 1,
      xp: 0,
      maxXp: 100,
      unspentStatPoints: 0,
      upgrades: {
        maxHp: 0,
        speed: 0,
        accel: 0
      }
    };
  }

  /**
   * Update HUD using local HP and active ship XP.
   *
   * @param {Object} stats
   */
  updateHpXp(stats) {
    const hp = stats?.hp ?? 0;
    const maxHp = stats?.maxHp ?? 0;
    const activeShipProgress = this._getActiveShipProgress();

    if (this.hud) {
      this.hud.updateHpXp({
        hp,
        maxHp,
        xp: activeShipProgress.xp ?? 0,
        maxXp: activeShipProgress.maxXp ?? 100
      });
    }
  }

  /**
   * Update minimap.
   *
   * @param {Object} data
   */
  updateMinimap(data) {
    if (this.minimap) {
      this.minimap.update(data.players, data.myId);
    }
  }

  /**
   * Set player progress.
   *
   * @param {Object} progress
   */
  setPlayerProgress(progress) {
    this.progress = cloneProgress(progress);

    if (this.levelPanel) {
      this.levelPanel.setProgress(this.progress);
    }

    if (this.classPicker && this.classPicker.isVisible()) {
      this.classPicker.setProgress(this.progress);
    }

    this._syncHudWithState();
  }

  /**
   * Get player progress.
   *
   * @returns {Object}
   */
  getPlayerProgress() {
    if (this.levelPanel && this.levelPanel.getProgress) {
      this.progress = this.levelPanel.getProgress();
    }

    return cloneProgress(this.progress);
  }

  /**
   * Sync the HUD with current HP and active ship XP.
   *
   * @private
   */
  _syncHudWithState() {
    if (!this.hud) return;

    const localStats = gameState.getLocalPlayerStats();
    const activeShipProgress = this._getActiveShipProgress();

    this.hud.updateHpXp({
      hp: localStats.hp ?? 0,
      maxHp: localStats.maxHp ?? 0,
      xp: activeShipProgress.xp ?? 0,
      maxXp: activeShipProgress.maxXp ?? 100
    });
  }

  /**
   * Tick UI positions.
   *
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
   * Get player info for debug tools.
   *
   * @private
   * @returns {Object}
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
   * Open the class picker.
   *
   * @param {Function} onPick
   * @param {Object} options
   * @returns {ClassPicker}
   */
  openClassPicker(onPick, options = {}) {
    if (this.classPicker && this.classPicker.isVisible()) {
      return this.classPicker;
    }

    const pickerOptions = {
      progress: options.progress || this.progress
    };

    this.classPicker = new ClassPicker(this.scene, (classKey) => {
      this.classPicker = null;

      if (typeof onPick === 'function') {
        onPick(classKey);
      }
    }, pickerOptions);

    return this.classPicker;
  }

  /**
   * Open level panel.
   */
  openLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.open();
    }
  }

  /**
   * Close level panel.
   */
  closeLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.close();
    }
  }

  /**
   * Toggle level panel.
   */
  toggleLevelPanel() {
    if (this.levelPanel) {
      this.levelPanel.toggle();
    }
  }

  /**
   * Show debug panel.
   */
  showDebug() {
    debugTools.show();
  }

  /**
   * Hide debug panel.
   */
  hideDebug() {
    debugTools.hide();
  }

  /**
   * Toggle debug panel.
   */
  toggleDebug() {
    debugTools.toggle();
  }

  /**
   * Show stats panel.
   */
  showStats() {
    statsTools.show();
  }

  /**
   * Hide stats panel.
   */
  hideStats() {
    statsTools.hide();
  }

  /**
   * Toggle stats panel.
   */
  toggleStats() {
    statsTools.toggle();
  }

  /**
   * Destroy all UI.
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
    statsTools.destroy();
  }
}

const uiManager = new UIManager();

if (typeof window !== 'undefined') {
  window.UIManager = UIManager;
  window.uiManager = uiManager;

  window.UI = {
    init: (scene, options = {}) => {
      const game = scene.game;
      uiManager.init(scene, game, options);
      return window.UI;
    },
    updateHpXp: (stats) => uiManager.updateHpXp(stats),
    tick: (camera) => uiManager.tick(camera),
    updateMinimap: (data) => uiManager.updateMinimap(data)
  };
}

export { UIManager };
export default uiManager;