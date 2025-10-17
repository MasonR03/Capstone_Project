
/**
 * Minimal server-side game engine.
 * - Authoritative positions
 * - Fixed tick at 30 Hz
 * - Simple thrust/turn and screen wrap
 */

const TICK_HZ = 30;
const DT = 1 / TICK_HZ;
const WIDTH = 800;
const HEIGHT = 600;

export function createGame(rooms) {
  const players = new Map();       // playerId -> {roomId, state}
  const inputs = new Map();        // playerId -> latest input packet
  let serverTime = 0;

  function addPlayer(roomId, playerId) {
    const state = {
      id: playerId,
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      angle: Math.random() * Math.PI * 2,
      vx: 0,
      vy: 0,
      hp: 100,
    };
    players.set(playerId, { roomId, state });
  }

  function removePlayer(playerId) {
    players.delete(playerId);
    inputs.delete(playerId);
  }

  function queueInput(playerId, input) {
    inputs.set(playerId, input);
  }

  function step() {
    for (const [playerId, rec] of players.entries()) {
      const { state } = rec;
      const input = inputs.get(playerId) || {};
      const turn = input.turn || 0;          // -1..1
      const thrust = input.thrust ? 1 : 0;   // boolean

      // update angle
      state.angle += turn * 3.0 * DT; // radians/sec

      // simple thrust
      const accel = thrust ? 120 : 0;
      state.vx += Math.cos(state.angle) * accel * DT;
      state.vy += Math.sin(state.angle) * accel * DT;

      // damping
      state.vx *= 0.99;
      state.vy *= 0.99;

      // integrate
      state.x += state.vx * DT;
      state.y += state.vy * DT;

      // screen wrap
      if (state.x < 0) state.x += WIDTH;
      if (state.x > WIDTH) state.x -= WIDTH;
      if (state.y < 0) state.y += HEIGHT;
      if (state.y > HEIGHT) state.y -= HEIGHT;
    }
    serverTime += DT;
  }

  // Fixed tick
  setInterval(step, Math.round(1000 / TICK_HZ));

  function snapshot(roomId) {
    const entities = [];
    for (const { roomId: rId, state } of players.values()) {
      if (rId === roomId) entities.push(state);
    }
    return {
      serverTime: Math.round(serverTime * 1000),
      width: WIDTH,
      height: HEIGHT,
      players: entities,
    };
  }

  return {
    addPlayer,
    removePlayer,
    queueInput,
    snapshot,
  };
}
