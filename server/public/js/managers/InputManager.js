/**
 * InputManager - Keyboard input handling
 *
 * Manages Phaser keyboard input for player movement.
 * Provides enable/disable control and current input state.
 */

class InputManager {
  constructor() {
    this.scene = null;
    this.cursors = null;
    this.enabled = false;
    this._fullscreenKey = null;
  }

  /**
   * Initialize the input manager with a Phaser scene
   * @param {Phaser.Scene} scene - The Phaser scene
   */
  init(scene) {
    this.scene = scene;

    // Set up movement keys
    this.cursors = scene.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN
    });

    // Fullscreen toggle
    this._fullscreenKey = scene.input.keyboard.on('keydown-F', () => {
      if (scene.scale.isFullscreen) {
        scene.scale.stopFullscreen();
      } else {
        scene.scale.startFullscreen();
      }
    });

    console.log('InputManager initialized');
  }

  /**
   * Enable input handling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable input handling
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Check if input is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get current input state
   * @returns {Object} Input state {left, right, up, down}
   */
  getCurrentInput() {
    if (!this.enabled || !this.cursors) {
      return { left: false, right: false, up: false, down: false };
    }

    return {
      left: !!this.cursors.left.isDown,
      right: !!this.cursors.right.isDown,
      up: !!this.cursors.up.isDown,
      down: !!this.cursors.down.isDown
    };
  }

  /**
   * Check if any movement key is pressed
   */
  isAnyKeyPressed() {
    const input = this.getCurrentInput();
    return input.left || input.right || input.up || input.down;
  }

  /**
   * Add a custom key handler
   * @param {string} keyCode - The key code (e.g., 'P', 'L', 'SPACE')
   * @param {Function} callback - Callback function
   * @param {string} eventType - 'keydown' or 'keyup'
   * @returns {Function} Unsubscribe function
   */
  addKeyHandler(keyCode, callback, eventType = 'keydown') {
    if (!this.scene) {
      console.warn('InputManager: Scene not initialized');
      return () => {};
    }

    const eventName = `${eventType}-${keyCode}`;
    this.scene.input.keyboard.on(eventName, callback);

    return () => {
      this.scene.input.keyboard.off(eventName, callback);
    };
  }

  /**
   * Add a raw keyboard event handler
   * @param {string} eventType - 'keydown' or 'keyup'
   * @param {Function} callback - Callback function(event)
   * @returns {Function} Unsubscribe function
   */
  addRawKeyHandler(eventType, callback) {
    if (!this.scene) {
      console.warn('InputManager: Scene not initialized');
      return () => {};
    }

    this.scene.input.keyboard.on(eventType, callback);

    return () => {
      this.scene.input.keyboard.off(eventType, callback);
    };
  }

  /**
   * Temporarily capture all keyboard input (e.g., for modal dialogs)
   * @param {Function} handler - Handler for captured input
   * @returns {Function} Release function to restore normal input
   */
  captureInput(handler) {
    const wasEnabled = this.enabled;
    this.disable();

    const keydownHandler = (event) => {
      handler(event);
    };

    this.scene.input.keyboard.on('keydown', keydownHandler);

    return () => {
      this.scene.input.keyboard.off('keydown', keydownHandler);
      if (wasEnabled) {
        this.enable();
      }
    };
  }

  /**
   * Destroy the input manager
   */
  destroy() {
    if (this.scene && this.scene.input && this.scene.input.keyboard) {
      this.scene.input.keyboard.off('keydown-F');
    }
    this.cursors = null;
    this.scene = null;
    this.enabled = false;
  }
}

// Create singleton instance
const inputManager = new InputManager();

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.InputManager = InputManager;
  window.inputManager = inputManager;
}

export { InputManager };
export default inputManager;
