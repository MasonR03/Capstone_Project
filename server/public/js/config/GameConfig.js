/**
 * GameConfig - Central configuration for all game constants
 *
 * Single source of truth for world settings, ship classes, thresholds, and UI constants.
 * Used by both managers and UI components.
 */

import { CLASS_STATS } from '../stats/stats.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getSfxVolume() {
  if (typeof window !== 'undefined' && typeof window.getSfxVolume === 'function') {
    return clamp01(window.getSfxVolume());
  }

  return 1;
}

const GameConfig = {
  // World bounds
  world: {
    width: 2000,
    height: 2000,
    borderWidth: 112,
    borderBuffer: 20,
    borderScrollSpeed: 12
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
    dragFactor: 0.995,
    gripFactor: 0.045
  },

  // Boost settings
  boost: {
    cooldownMs: 3000,
    impulse: 430,
    durationMs: 650,
    momentumMs: 1400,
    maxSpeedMultiplier: 2.1
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
    initialZoom: 1.0,
    baseWidth: 1280,
    baseHeight: 720
  },

  // Backdrop settings
  backdrop: {
    holdMs: 14000,
    fadeMs: 7000
  },

  // Minimap settings
  minimap: {
    size: 160,
    radius: 70,
    margin: 20,
    worldRange: 600,
    colors: {
      border: 0x00ffff,
      myDot: 0x44ff66,
      otherDot: 0xff4444
    }
  },

  // Reward settings
  rewards: {
    playerEliminationXp: 100
  },

  // Warning thresholds
  warnings: {
    lowHpThreshold: 50
  },

  // Ping measurement interval
  network: {
    pingInterval: 1000
  },

  // Collectible settings
  collectibles: {
    stars: {
      collectRadius: 40,
      defaultXpValue: 30,
      defaultPointValue: 1
    }
  },

  asteroids: {
    hp: 50,
    radius: 32,
    xpValue: 200
  },

  // Audio settings
  audio: {
    defaultSfxVolume: 1
  },

  getSfxVolume,

  getSfxVolumeFor(baseVolume = 1) {
    return clamp01(baseVolume) * getSfxVolume();
  },

  // Weapon settings
  weapons: {
    bulletSpeed: 500,
    bulletLifetime: 2000,
    fireRate: 250,
    bulletDamage: 15,
    bulletSize: 8,
    laser: {
      coreLength: 22,
      coreWidth: 5,
      haloLength: 32,
      haloWidth: 14,
      trailLifespan: 250,
      muzzleScale: 0.6,
      impactDuration: 150,
      colorByClass: {
        starter: { core: 0xffffff, glow: 0x00e5ff },
        hunter:  { core: 0xffffff, glow: 0xff3366 },
        tanker:  { core: 0xffffff, glow: 0xffaa33 }
      },
      defaultColor: { core: 0xffffff, glow: 0x00e5ff }
    }
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
    laserSound: 'assets/laser.m4a',
    hitSound: 'assets/hit.mp3',
    lowHpSound: 'assets/lowhp.m4a',
    boostSound: 'assets/boost.mp3',
    asteroidBelt: 'assets/asteroidbelt.png',
    asteroid: 'assets/asteroid.png',
    explodedAsteroid: 'assets/exploded_asteroid.png',
    asteroidBoom: 'assets/asteroidboom.mp3',
    weaponHitSound: 'assets/weaponhit.m4a',
    levelUpSound: 'assets/levelup.mp3',
    starCollectSound: 'assets/starcollect.mp3',
    collectibleStar: 'assets/Star.png',

    menuIn: 'assets/MenuSliderIn.png',
    menuOut: 'assets/MenuSliderOut.png',
    backdrop: 'assets/backdrop_tile.webp',
    backdrops: [
      'assets/backdrop_tile.webp',
      'assets/backdrop_tile1.webp',
      'assets/backdrop_tile3.webp'
    ]
  }
};

if (typeof window !== 'undefined') {
  window.GameConfig = GameConfig;
}

export default GameConfig;
