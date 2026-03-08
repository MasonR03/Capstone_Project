/**
 * ClassPicker - Ship class selection UI
 *
 * Keyboard-navigable modal for selecting a ship class at game start.
 */

import {
  CLASS_STATS,
  PLAYER_PROGRESS_DEFAULTS,
  cloneProgress,
  getShipStats
} from '../stats/stats.js';

/**
 * Get config with fallback.
 *
 * @returns {Object}
 */
const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;

  return {
    shipClasses: {
      starter: {
        name: 'Starter',
        spriteKey: 'ship_starter',
        stats: CLASS_STATS.starter
      },
      hunter: {
        name: 'Hunter',
        spriteKey: 'ship_hunter',
        stats: CLASS_STATS.hunter
      },
      tanker: {
        name: 'Tanker',
        spriteKey: 'ship_tanker',
        stats: CLASS_STATS.tanker
      }
    },
    defaultClass: 'starter',
    sprites: {
      ship: { width: 53, height: 40 }
    }
  };
};

class ClassPicker {
  /**
   * Create a new ClassPicker.
   *
   * @param {Phaser.Scene} scene
   * @param {Function} onPick
   * @param {Object} options
   */
  constructor(scene, onPick, options = {}) {
    const config = getConfig();

    this.scene = scene;
    this.onPick = onPick;
    this.config = config;
    this.shipClasses = config.shipClasses;
    this.defaultClass = config.defaultClass || 'starter';
    this.progress = cloneProgress(options.progress || PLAYER_PROGRESS_DEFAULTS);

    // State
    this.selectedIndex = 0;
    this.classKeys = Object.keys(this.shipClasses);
    this.isOpen = false;

    // UI elements
    this.overlay = null;
    this.rows = [];
    this.keyboardHandler = null;

    if (this.classKeys.length === 0) {
      this._complete(this.defaultClass);
      return;
    }

    this._setInitialSelection();
    this._create();
  }

  /**
   * Set the first owned ship as selected.
   *
   * @private
   */
  _setInitialSelection() {
    const firstOwnedIndex = this.classKeys.findIndex((key) => this._isOwned(key));
    this.selectedIndex = firstOwnedIndex >= 0 ? firstOwnedIndex : 0;
  }

  /**
   * Create the picker UI.
   *
   * @private
   */
  _create() {
    console.log('~~~ ClassPicker created ~~~');

    try {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      if (window.focus) {
        window.focus();
      }
    } catch (e) {}

    const cam = this.scene.cameras.main;

    this.overlay = this.scene.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(999999);

    const dim = this.scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.80)
      .setOrigin(0, 0);
    this.overlay.add(dim);

    const title = this.scene.add.text(cam.width / 2, 46, 'Choose Your Ship', {
      fontSize: '28px',
      fill: '#e9fbff',
      fontFamily: 'Orbitron, monospace',
      stroke: '#0b2230',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);
    this.overlay.add(title);

    const hint = this.scene.add.text(
      cam.width / 2,
      104,
      '↑/W up   ↓/S down   ENTER pick   ESC cancel',
      {
        fontSize: '13px',
        fill: '#9dd9e6',
        fontFamily: 'Orbitron, monospace'
      }
    ).setOrigin(0.5, 0.5);
    this.overlay.add(hint);

    this._buildRows(cam);
    this._setupKeyboard();
    this._refresh();

    this.isOpen = true;
  }

  /**
   * Build the ship selection rows.
   *
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   * @private
   */
  _buildRows(cam) {
    const startY = 190;
    const config = this.config || getConfig();
    const shipWidth = (config.sprites && config.sprites.ship && config.sprites.ship.width) || 53;
    const shipHeight = (config.sprites && config.sprites.ship && config.sprites.ship.height) || 40;
    const shipScale = 1.8;

    this.classKeys.forEach((key, i) => {
      const classCfg = this.shipClasses[key];
      const y = startY + i * 150;

      const row = this.scene.add.container(cam.width / 2, y);
      this.overlay.add(row);

      const rowW = 700;
      const rowH = 130;

      const box = this.scene.add.rectangle(0, 0, rowW, rowH, 0x0b141b, 0.95)
        .setStrokeStyle(2, 0x1fb6d1, 0.35);
      row.add(box);

      const glow = this.scene.add.rectangle(0, 0, rowW + 10, rowH + 10, 0x00c8ff, 0.08)
        .setStrokeStyle(2, 0x00c8ff, 0.18)
        .setVisible(false);
      row.add(glow);

      const leftX = -rowW / 2 + 100;
      const nameX = -rowW / 2 + 210;
      const statsX = 35;
      const tagX = rowW / 2 - 85;
      const costX = rowW / 2 - 85;

      const shipImg = this.scene.add.image(leftX, 6, classCfg.spriteKey);
      shipImg.setDisplaySize(shipWidth * shipScale, shipHeight * shipScale);
      row.add(shipImg);

      const nameText = this.scene.add.text(nameX, -20, classCfg.name, {
        fontSize: '18px',
        fill: '#e9fbff',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0, 0.5);
      row.add(nameText);

      const st = getShipStats(key, this.progress) || classCfg.stats;
      const statsText = this.scene.add.text(statsX, -2, `HP ${st.maxHp}   SPD ${st.speed}   ACC ${st.accel}`, {
        fontSize: '14px',
        fill: '#b8d7e2',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0, 0.5);
      row.add(statsText);

      const tag = this.scene.add.text(tagX, -10, '', {
        fontSize: '13px',
        fill: '#00ffcc',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0.5, 0.5);
      row.add(tag);

      const costText = this.scene.add.text(costX, 16, '', {
        fontSize: '12px',
        fill: '#ffd27f',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0.5, 0.5);
      row.add(costText);

      box.setInteractive({ useHandCursor: true });

      box.on('pointerover', () => {
        this.selectedIndex = i;
        this._refresh();
      });

      box.on('pointerdown', () => {
        this.selectedIndex = i;
        this._refresh();

        const pickedKey = this.classKeys[this.selectedIndex];
        if (!this._isOwned(pickedKey)) return;

        this._complete(pickedKey);
      });

      this.rows.push({
        key,
        box,
        glow,
        tag,
        costText
      });
    });
  }

  /**
   * Set up keyboard navigation.
   *
   * @private
   */
  _setupKeyboard() {
    const kb = this.scene.input.keyboard;

    this.keyboardHandler = (ev) => {
      const code = ev.code;

      if (code === 'KeyP' || code === 'KeyW' || code === 'ArrowUp') {
        this.selectedIndex = (this.selectedIndex - 1 + this.classKeys.length) % this.classKeys.length;
        this._refresh();
        return;
      }

      if (code === 'KeyL' || code === 'KeyS' || code === 'ArrowDown') {
        this.selectedIndex = (this.selectedIndex + 1) % this.classKeys.length;
        this._refresh();
        return;
      }

      if (code === 'Enter' || code === 'Space') {
        const pickedKey = this.classKeys[this.selectedIndex];
        if (!this._isOwned(pickedKey)) return;
        this._complete(pickedKey);
        return;
      }

      if (code === 'Digit1' || code === 'Numpad1') {
        this.selectedIndex = 0;
        this._refresh();
        if (this._isOwned(this.classKeys[this.selectedIndex])) {
          this._complete(this.classKeys[this.selectedIndex]);
        }
        return;
      }

      if (code === 'Digit2' || code === 'Numpad2') {
        if (this.classKeys.length > 1) {
          this.selectedIndex = 1;
          this._refresh();
          if (this._isOwned(this.classKeys[this.selectedIndex])) {
            this._complete(this.classKeys[this.selectedIndex]);
          }
        }
        return;
      }

      if (code === 'Digit3' || code === 'Numpad3') {
        if (this.classKeys.length > 2) {
          this.selectedIndex = 2;
          this._refresh();
          if (this._isOwned(this.classKeys[this.selectedIndex])) {
            this._complete(this.classKeys[this.selectedIndex]);
          }
        }
        return;
      }

      if (code === 'Escape') {
        this._complete(this.defaultClass);
      }
    };

    kb.on('keydown', this.keyboardHandler);
  }

  /**
   * Check if a ship is owned.
   *
   * @param {string} key
   * @returns {boolean}
   * @private
   */
  _isOwned(key) {
    return Array.isArray(this.progress.unlockedShips) && this.progress.unlockedShips.includes(key);
  }

  /**
   * Refresh visual state.
   *
   * @private
   */
  _refresh() {
    this.rows.forEach((r, i) => {
      const selected = i === this.selectedIndex;
      const owned = this._isOwned(r.key);
      const isCurrent = this.progress.selectedShip === r.key;
      const cost = CLASS_STATS[r.key]?.unlockCost ?? 0;

      r.box.setStrokeStyle(
        2,
        selected ? 0x00ffcc : 0xffffff,
        selected ? 0.95 : 0.30
      );

      if (r.glow) {
        r.glow.setVisible(selected);
      }

      if (!owned) {
        r.tag.setText('LOCKED');
        r.tag.setColor('#ff8f8f');
        r.costText.setText(`COST ${cost}`);
      } else if (isCurrent) {
        r.tag.setText('SELECTED');
        r.tag.setColor('#00ffcc');
        r.costText.setText('');
      } else {
        r.tag.setText('OWNED');
        r.tag.setColor('#8de6ff');
        r.costText.setText('');
      }
    });
  }

  /**
   * Update progress and redraw state.
   *
   * @param {Object} progress
   */
  setProgress(progress) {
    this.progress = cloneProgress(progress);
    this._refresh();
  }

  /**
   * Complete selection and clean up.
   *
   * @param {string} classKey
   * @private
   */
  _complete(classKey) {
    this._cleanup();

    if (this.onPick) {
      this.onPick(classKey);
    }
  }

  /**
   * Clean up UI elements.
   *
   * @private
   */
  _cleanup() {
    if (this.keyboardHandler) {
      this.scene.input.keyboard.off('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    this.rows = [];
    this.isOpen = false;
  }

  /**
   * Check if picker is open.
   *
   * @returns {boolean}
   */
  isVisible() {
    return this.isOpen;
  }

  /**
   * Force close picker.
   */
  close() {
    if (this.isOpen) {
      this._complete(this.defaultClass);
    }
  }
}

/**
 * Backward compatible helper.
 *
 * @param {Phaser.Scene} scene
 * @param {Function} onPick
 * @param {Object} options
 * @returns {ClassPicker}
 */
function openClassPickerKeyboard(scene, onPick, options = {}) {
  return new ClassPicker(scene, onPick, options);
}

if (typeof window !== 'undefined') {
  window.ClassPicker = ClassPicker;
  window.openClassPickerKeyboard = openClassPickerKeyboard;
}

export { ClassPicker, openClassPickerKeyboard };
export default ClassPicker;