const assert = require('node:assert/strict');
const test = require('node:test');

const Bullet = require('../server/authoritative_server/js/entities/Bullet');
const BulletManager = require('../server/authoritative_server/js/managers/BulletManager');
const CollectibleStarManager = require('../server/authoritative_server/js/managers/CollectibleStarManager');
const EntityManager = require('../server/authoritative_server/js/managers/EntityManager');
const Ship = require('../server/authoritative_server/js/entities/Ship');
const {
  clampHpToMax,
  getResolvedShipStats,
  getShipLevel
} = require('../server/authoritative_server/js/game');

function withMockedDateNow(t, value) {
  // Fire-rate and cooldown behavior depends on Date.now, so pin it per test.
  const original = Date.now;
  Date.now = () => value;
  t.after(() => {
    Date.now = original;
  });
}

function makeShip(id, x, y, overrides = {}) {
  // Minimal ship double for managers that only need position, hp, and damage.
  return {
    id,
    x,
    y,
    hp: 100,
    maxHp: 100,
    collisionRadius: 26,
    lastCollisionDamageAt: 0,
    barrierHitThisFrame: false,
    takeDamage(amount) {
      this.hp = Math.max(0, this.hp - amount);
      return this.hp <= 0;
    },
    ...overrides
  };
}

test('game stat helpers resolve class upgrades and keep values within safe bounds', () => {
  // This mirrors the client progress shape sent during class selection.
  const progress = {
    shipProgress: {
      hunter: {
        level: 3.7,
        upgrades: {
          maxHp: 2,
          speed: 1,
          accel: 3
        }
      }
    }
  };

  assert.deepEqual(getResolvedShipStats('hunter', progress), {
    maxHp: 110,
    speed: 268,
    accel: 244
  });
  assert.deepEqual(getResolvedShipStats('unknown', {}), {
    maxHp: 110,
    speed: 210,
    accel: 190
  });
  // Fractions and unsafe values are floored or clamped by the helpers.
  assert.equal(getShipLevel('hunter', progress), 3);
  assert.equal(getShipLevel('hunter', { shipProgress: { hunter: { level: -2 } } }), 1);
  assert.equal(clampHpToMax(140, 100), 100);
  assert.equal(clampHpToMax(-10, 100), 0);
  assert.equal(clampHpToMax(Number.NaN, 75), 75);
});

test('ship combat and progression helpers clamp health and XP', () => {
  const ship = new Ship('ship-1', 10, 20, { hp: 50, maxHp: 75, xp: 90, maxXp: 100 });

  assert.equal(ship.takeDamage(20), false);
  assert.equal(ship.hp, 30);
  assert.equal(ship.takeDamage(40), true);
  assert.equal(ship.hp, 0);

  ship.heal(999);
  assert.equal(ship.hp, 75);

  assert.equal(ship.gainXP(20), true);
  assert.equal(ship.xp, 100);
});

test('bullets move, expire, and serialize their network payload', () => {
  const bullet = new Bullet('b_1', 'owner-1', 100, 100, 0, {
    speed: 100,
    lifetime: 50,
    damage: 12
  });

  const startX = bullet.x;
  const startY = bullet.y;

  // Half the lifetime should move the bullet without expiring it.
  bullet.update(25);

  assert.ok(bullet.x > startX);
  assert.ok(bullet.y > startY);
  assert.equal(bullet.alive, true);

  // Reaching the configured lifetime marks the bullet dead.
  bullet.update(25);

  assert.equal(bullet.alive, false);
  assert.deepEqual(bullet.serialize(), {
    id: 'b_1',
    ownerId: 'owner-1',
    x: bullet.x,
    y: bullet.y
  });
});

test('bullet manager rate-limits shots and reports ship hits', (t) => {
  withMockedDateNow(t, 1000);

  const manager = new BulletManager(
    { width: 500, height: 500 },
    { bulletSpeed: 100, bulletLifetime: 1000, bulletDamage: 25, fireRate: 50 }
  );

  const first = manager.tryFire('owner-1', 100, 100, 0);
  assert.ok(first);
  // The same player cannot fire again until fireRate milliseconds pass.
  assert.equal(manager.tryFire('owner-1', 100, 100, 0), null);

  Date.now = () => 1051;
  const second = manager.tryFire('owner-1', 100, 100, 0);
  assert.ok(second);
  // Keep the collision assertion focused on the first bullet only.
  manager.remove(second.id);

  const target = makeShip('target-1', first.x, first.y, { hp: 30 });
  const result = manager.update(0, new Map([
    ['owner-1', makeShip('owner-1', first.x, first.y)],
    ['target-1', target]
  ]));

  assert.deepEqual(result.destroyed, [{
    bulletId: 'b_0',
    ownerId: 'owner-1',
    shipId: 'target-1',
    damage: 25,
    killed: false
  }]);
  assert.deepEqual(result.removed, ['b_0']);
  assert.equal(target.hp, 5);
});

test('collectible stars respect caps, collection radius, and dead ships', () => {
  const manager = new CollectibleStarManager(
    { width: 100, height: 100 },
    {
      maxCount: 2,
      spawnIntervalMs: 50,
      spawnMargin: 10,
      collectRadius: 12,
      xpValue: 30,
      pointValue: 1
    }
  );

  const spawned = manager.fillToCap();
  assert.equal(spawned.length, 2);
  assert.equal(manager.serializeAll().length, 2);

  const [star] = manager.serializeAll();
  // Too far away and dead ships should both fail collection.
  assert.equal(manager.tryCollect(star.id, { x: star.x + 20, y: star.y, hp: 100 }), null);
  assert.equal(manager.tryCollect(star.id, { x: star.x, y: star.y, hp: 0 }), null);

  const collected = manager.tryCollect({ starId: star.id }, { x: star.x, y: star.y, hp: 100 });
  assert.deepEqual(collected, star);
  assert.equal(manager.serializeAll().length, 1);

  // Replacement spawns only after the configured interval has elapsed.
  assert.deepEqual(manager.update(49), []);
  assert.equal(manager.update(1).length, 1);
  assert.equal(manager.serializeAll().length, 2);
});

test('entity manager collision processing damages overlapping ships and honors cooldowns', () => {
  const manager = new EntityManager(null);
  const first = makeShip('first', 100, 100);
  const second = makeShip('second', 110, 100);

  manager.ships.set(first.id, first);
  manager.ships.set(second.id, second);

  const firstEvents = manager.processCollisions(1000);

  // Overlapping ships both take 25% max-HP collision damage.
  assert.equal(firstEvents.length, 2);
  assert.equal(first.hp, 75);
  assert.equal(second.hp, 75);
  assert.deepEqual(firstEvents.map((event) => event.source), ['ship', 'ship']);

  const cooldownEvents = manager.processCollisions(1200);
  assert.deepEqual(cooldownEvents, []);
  assert.equal(first.hp, 75);

  // Barrier damage is allowed again after the cooldown window.
  first.barrierHitThisFrame = true;
  const barrierEvents = manager.processCollisions(1600);

  assert.equal(barrierEvents[0].shipId, 'first');
  assert.equal(barrierEvents[0].source, 'barrier');
  assert.equal(first.hp, 50);
});
