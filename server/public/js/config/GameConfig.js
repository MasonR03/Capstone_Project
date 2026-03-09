/**
 * GameConfig - Central configuration for all game constants
 *
 * Single source of truth for world settings, ship classes, thresholds, and UI constants.
 * Used by both managers and UI components.
 */

import { CLASS_STATS } from '../stats/stats.js';

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
    starter: {
      name: CLASS_STATS.starter.name,
      spriteKey: CLASS_STATS.starter.spriteKey,
      stats: {
        maxHp: CLASS_STATS.starter.maxHp,
        speed: CLASS_STATS.starter.speed,
        accel: CLASS_STATS.starter.accel
      }
    },
    hunter: {
      name: CLASS_STATS.hunter.name,
      spriteKey: CLASS_STATS.hunter.spriteKey,
      stats: {
        maxHp: CLASS_STATS.hunter.maxHp,
        speed: CLASS_STATS.hunter.speed,
        accel: CLASS_STATS.hunter.accel
      }
    },
    tanker: {
      name: CLASS_STATS.tanker.name,
      spriteKey: CLASS_STATS.tanker.spriteKey,
      stats: {
        maxHp: CLASS_STATS.tanker.maxHp,
        speed: CLASS_STATS.tanker.speed,
        accel: CLASS_STATS.tanker.accel
      }
    }
  },
  defaultClass: 'starter',

  // Ship physics
  shipPhysics: {
    maxSpeed: 400,
    acceleration: 200,
    angularSpeed: 420 * (Math.PI / 180),
    dragFactor: 0.98,
    gripFactor: 0.2
  },

  // Movement sync
  movement: {
    snapThreshold: 10000,
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
      otherDot: 0xffffff
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

  // Weapon settings
  weapons: {
    bulletSpeed: 500,
    bulletLifetime: 2000,
    fireRate: 250,
    bulletDamage: 15,
    bulletSize: 8
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
      starter: 'assets/spaceShips_001.png',
      hunter: 'assets/vector_shipH.svg',
      tanker: 'assets/vector_shipT.svg'
    },
    bullet: 'assets/bullet_defult.png',
    hudBars: 'assets/Bar.png',
    menuIn: 'assets/MenuSliderIn.png',
    menuOut: 'assets/MenuSliderOut.png',
    backdrop: 'assets/backdrop_tile.webp'
  }
};

if (typeof window !== 'undefined') {
  window.GameConfig = GameConfig;
}

export default GameConfig;