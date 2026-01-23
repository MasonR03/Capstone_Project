/**
 * ClassPicker - Ship class selection UI
 *
 * Keyboard-navigable modal for selecting a ship class at game start.
 */

// Get config with fallback
const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;
  return {
    shipClasses: {
      hunter: { name: 'Hunter', spriteKey: 'ship_hunter', stats: { maxHp: 90, speed: 260, accel: 220 } },
      tanker: { name: 'Tanker', spriteKey: 'ship_tanker', stats: { maxHp: 160, speed: 180, accel: 160 } }
    },
    defaultClass: 'hunter',
    sprites: {
      ship: { width: 53, height: 40 }
    }
  };
};

class ClassPicker {
  /**
   * Create a new ClassPicker
   * @param {Phaser.Scene} scene - The Phaser scene
   * @param {Function} onPick - Callback when class is picked (classKey)
   */
  constructor(scene, onPick) {
    const config = getConfig();
    this.scene = scene;
    this.onPick = onPick;
    this.config = config;
    this.shipClasses = config.shipClasses;
    this.defaultClass = config.defaultClass;

    // State
    this.selectedIndex = 0;
    this.classKeys = Object.keys(this.shipClasses);
    this.isOpen = false;

    // UI elements
    this.overlay = null;
    this.rows = [];
    this.keyboardHandler = null;

    if (this.classKeys.length === 0) {
      // No classes defined, just pick default
      this._complete(this.defaultClass);
      return;
    }

    this._create();
  }

  /**
   * Create the picker UI
   * @private
   */
  _create() {
    console.log('~~~ ClassPicker created ~~~');

    // Try to blur active element to capture keyboard
    try {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      window.focus && window.focus();
    } catch (e) {}

    const cam = this.scene.cameras.main;

    // Overlay container (screen-space)
    this.overlay = this.scene.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(999999);

    // Dim background
    const dim = this.scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.80)
      .setOrigin(0, 0);
    this.overlay.add(dim);

    // Title
    const title = this.scene.add.text(cam.width / 2, 46, 'Choose Your Ship', {
      fontSize: '28px',
      fill: '#e9fbff',
      fontFamily: 'Orbitron, monospace',
      stroke: '#0b2230',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);
    this.overlay.add(title);

    // Controls hint
    const hint = this.scene.add.text(
      cam.width / 2,
      104,
      '↑/W up   ↓/S down   ENTER pick   ESC cancel',
      { fontSize: '13px', fill: '#9dd9e6', fontFamily: 'Orbitron, monospace' }
    ).setOrigin(0.5, 0.5);
    this.overlay.add(hint);

    // Build ship rows
    this._buildRows(cam);

    // Set up keyboard handler
    this._setupKeyboard();

    // Initial refresh
    this._refresh();
    this.isOpen = true;
  }

  /**
   * Build the ship selection rows
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

      // Row container
      const row = this.scene.add.container(cam.width / 2, y);
      this.overlay.add(row);

      // Selection box
      const box = this.scene.add.rectangle(0, 0, 560, 130, 0x0b141b, 0.95)
        .setStrokeStyle(2, 0x1fb6d1, 0.35);
      row.add(box);

      // Soft glow border (subtle)
      const glow = this.scene.add.rectangle(0, 0, 570, 140, 0x00c8ff, 0.08)
        .setStrokeStyle(2, 0x00c8ff, 0.18);
      row.add(glow);

      // Ship image
      const shipImg = this.scene.add.image(-200, 6, classCfg.spriteKey);
      shipImg.setDisplaySize(shipWidth * shipScale, shipHeight * shipScale);
      row.add(shipImg);

      // Ship name
      const nameText = this.scene.add.text(shipImg.x + 120, shipImg.y - 22, classCfg.name, {
        fontSize: '18px',
        fill: '#e9fbff',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0.5, 0.5);
      row.add(nameText);

      // Stats
      const st = classCfg.stats;
      const statsText = this.scene.add.text(40, -10, `HP ${st.maxHp}   SPD ${st.speed}   ACC ${st.accel}`, {
        fontSize: '14px',
        fill: '#b8d7e2',
        fontFamily: 'Orbitron, monospace'
      });
      row.add(statsText);

      // Selection tag
      const tag = this.scene.add.text(235, 0, '', {
        fontSize: '13px',
        fill: '#00ffcc',
        fontFamily: 'Orbitron, monospace'
      }).setOrigin(0.5, 0.5);
      row.add(tag);

      // Click / hover handling
      box.setInteractive({ useHandCursor: true });
      box.on('pointerover', () => {
        this.selectedIndex = i;
        this._refresh();
      });
      box.on('pointerdown', () => {
        this.selectedIndex = i;
        this._refresh();
        this._complete(this.classKeys[this.selectedIndex]);
      });

      this.rows.push({ key, box, tag });
    });
  }

  /**
   * Set up keyboard navigation
   * @private
   */
  _setupKeyboard() {
    const kb = this.scene.input.keyboard;

    this.keyboardHandler = (ev) => {
      const code = ev.code;

      // Navigate up
      if (code === 'KeyP' || code === 'KeyW' || code === 'ArrowUp') {
        this.selectedIndex = (this.selectedIndex - 1 + this.classKeys.length) % this.classKeys.length;
        this._refresh();
        return;
      }

      // Navigate down
      if (code === 'KeyL' || code === 'KeyS' || code === 'ArrowDown') {
        this.selectedIndex = (this.selectedIndex + 1) % this.classKeys.length;
        this._refresh();
        return;
      }

      // Select
      if (code === 'Enter' || code === 'Space') {
        this._complete(this.classKeys[this.selectedIndex]);
        return;
      }

      // Direct numeric select
      if (code === 'Digit1' || code === 'Numpad1') {
        this.selectedIndex = 0;
        this._refresh();
        this._complete(this.classKeys[this.selectedIndex]);
        return;
      }
      if (code === 'Digit2' || code === 'Numpad2') {
        if (this.classKeys.length > 1) {
          this.selectedIndex = 1;
          this._refresh();
          this._complete(this.classKeys[this.selectedIndex]);
        }
        return;
      }

      // Cancel
      if (code === 'Escape') {
        this._complete(this.defaultClass);
        return;
      }
    };

    kb.on('keydown', this.keyboardHandler);
  }

  /**
   * Refresh visual state
   * @private
   */
  _refresh() {
    this.rows.forEach((r, i) => {
      const selected = i === this.selectedIndex;
      r.box.setStrokeStyle(2, selected ? 0x00ffcc : 0xffffff, selected ? 0.9 : 0.35);
      r.tag.setText(selected ? 'SELECTED' : '');
    });
  }

  /**
   * Complete selection and clean up
   * @private
   */
  _complete(classKey) {
    this._cleanup();
    if (this.onPick) {
      this.onPick(classKey);
    }
  }

  /**
   * Clean up UI elements
   * @private
   */
  _cleanup() {
    // Remove keyboard handler
    if (this.keyboardHandler) {
      this.scene.input.keyboard.off('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Destroy overlay
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    this.rows = [];
    this.isOpen = false;
  }

  /**
   * Check if picker is currently open
   */
  isVisible() {
    return this.isOpen;
  }

  /**
   * Force close (for external cleanup)
   */
  close() {
    if (this.isOpen) {
      this._complete(this.defaultClass);
    }
  }
}

// Backward compatibility: expose as function for existing clientGame.js
function openClassPickerKeyboard(scene, onPick) {
  return new ClassPicker(scene, onPick);
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.ClassPicker = ClassPicker;
  window.openClassPickerKeyboard = openClassPickerKeyboard;
}

export { ClassPicker, openClassPickerKeyboard };
export default ClassPicker;
