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
    defaultClass: 'hunter'
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
    const title = this.scene.add.text(cam.width / 2, 80, 'Choose Your Ship', {
      fontSize: '26px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0.5);
    this.overlay.add(title);

    // Controls hint
    const hint = this.scene.add.text(
      cam.width / 2,
      112,
      'P/W up   L/S down   ENTER pick   ESC cancel',
      { fontSize: '14px', fill: '#cccccc', fontFamily: 'monospace' }
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
    const startY = 180;

    this.classKeys.forEach((key, i) => {
      const cfg = this.shipClasses[key];
      const y = startY + i * 150;

      // Row container
      const row = this.scene.add.container(cam.width / 2, y);
      this.overlay.add(row);

      // Selection box
      const box = this.scene.add.rectangle(0, 0, 520, 120, 0x111111, 0.95)
        .setStrokeStyle(2, 0xffffff, 0.35);
      row.add(box);

      // Ship image
      const shipImg = this.scene.add.image(-200, 0, cfg.spriteKey).setScale(1.0);
      row.add(shipImg);

      // Ship name
      const nameText = this.scene.add.text(-130, -26, cfg.name, {
        fontSize: '20px',
        fill: '#ffffff',
        fontFamily: 'monospace'
      });
      row.add(nameText);

      // Stats
      const st = cfg.stats;
      const statsText = this.scene.add.text(-130, 6, `HP ${st.maxHp}   SPD ${st.speed}   ACC ${st.accel}`, {
        fontSize: '14px',
        fill: '#cccccc',
        fontFamily: 'monospace'
      });
      row.add(statsText);

      // Selection tag
      const tag = this.scene.add.text(190, 34, '', {
        fontSize: '14px',
        fill: '#00ffcc',
        fontFamily: 'monospace'
      }).setOrigin(0.5, 0.5);
      row.add(tag);

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
      if (code === 'KeyP' || code === 'KeyW') {
        this.selectedIndex = (this.selectedIndex - 1 + this.classKeys.length) % this.classKeys.length;
        this._refresh();
        return;
      }

      // Navigate down
      if (code === 'KeyL' || code === 'KeyS') {
        this.selectedIndex = (this.selectedIndex + 1) % this.classKeys.length;
        this._refresh();
        return;
      }

      // Select
      if (code === 'Enter' || code === 'Space') {
        this._complete(this.classKeys[this.selectedIndex]);
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
