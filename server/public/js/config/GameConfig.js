/**
 * GameConfig - Central configuration for all game constants
 *
 * Single source of truth for world settings, ship classes, thresholds, and UI constants.
 * Used by both managers and UI components.
 */

const GameConfig = {
  // World bounds
  world: {
    width: 2000,
    height: 2000,
    borderWidth: 30,
    borderBuffer: 20
  },

  // Phaser game configuration
  phaser: {
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    physics: {
      default: 'arcade',
      arcade: { debug: false, gravity: { y: 0 } }
    }
  },

  // Ship class definitions
  shipClasses: {
    hunter: {
      name: 'Hunter',
      spriteKey: 'ship_hunter',
      stats: { maxHp: 90, speed: 260, accel: 220 }
    },
    tanker: {
      name: 'Tanker',
      spriteKey: 'ship_tanker',
      stats: { maxHp: 160, speed: 180, accel: 160 }
    }
  },
  defaultClass: 'hunter',

  // Ship physics (must match server)
  shipPhysics: {
    maxSpeed: 400,
    acceleration: 200,
    angularSpeed: 300 * (Math.PI / 180), // 5.236 rad/s
    dragFactor: 0.98
  },

  // Movement sync
  movement: {
    snapThreshold: 10000,  // squared distance; snap if error > 100 units
    blendFactor: 0.1,
    interpolationFactor: 0.15
  },

  // Camera settings
  camera: {
    followLerpX: 0.12,
    followLerpY: 0.12,
    initialZoom: 1.0
  },

  // Minimap settings
  minimap: {
    size: 160,
    radius: 70,
    margin: 20,
    worldRange: 600,
    colors: {
      border: 0x00ffff,
      myDot: 0x00e5ff,
      redDot: 0xff6666,
      blueDot: 0x6688ff,
      otherDot: 0xffffff,
      starDot: 0xffd93b
    }
  },

  // HUD layout constants
  hud: {
    x: 16,
    y: 16,
    hp: {
      startX: 50,
      centerY: 14,
      endX: 128
    },
    xp: {
      startX: 50,
      centerY: 48,
      endX: 128
    },
    fillPadX: 2
  },

  // Ping measurement interval
  network: {
    pingInterval: 1000
  },

  // Star count
  stars: {
    count: 5,
    scale: 1.15,
    pulseScale: 1.35,
    pulseAlpha: 0.75,
    pulseDuration: 700
  },

  // Sprite dimensions
  sprites: {
    ship: {
      width: 53,
      height: 40
    },
    nameOffset: 70
  },

  // Asset paths
  assets: {
    ships: {
      hunter: 'assets/HunterShip.png',
      tanker: 'assets/TankerShip.png'
    },
    star: 'assets/Star.png',
    hudBars: 'assets/Bar.png',
    menuIn: 'assets/MenuSliderIn.png',
    menuOut: 'assets/MenuSliderOut.png'
  }
};

// Note: Not freezing GameConfig because Phaser needs to mutate physics config during initialization

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.GameConfig = GameConfig;
}

export default GameConfig;
