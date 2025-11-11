// server/authoritative_server/js/ui/index.js
// Small wrapper so the server code stays clean.
// It also adapts to your public client event names.

function emitScore(target, scores) {
  // accepts either io or socket
  target.emit('updateScore', scores);
}

/**
 * Your public client currently listens to **'starLocation'** (singular)
 * and only supports ONE star sprite. Your server tracks 5 stars.
 *
 * Option A (no client change): send only the first star as 'starLocation'.
 * Option B (recommended): update the client to handle many stars with
 * the 'starsLocation' event (array).
 *
 * We’ll support BOTH here for safety.
 */
function emitStars(target, starsArray) {
  // Send array for multi-star clients:
  target.emit('starsLocation', starsArray);

  // Also send the first star for the existing single-star client:
  if (starsArray && starsArray.length > 0) {
    target.emit('starLocation', { x: starsArray[0].x, y: starsArray[0].y });
  }
}

/**
 * Optional snapshot of UI-ish state; safe to ignore on the client if unused.
 */
function emitUiState(io, players, gameState) {
  io.emit('uiSnapshot', {
    scores: gameState.scores,
    playerCount: Object.keys(players).length,
    stars: gameState.stars,
    ts: Date.now()
  });
}

module.exports = { emitScore, emitStars, emitUiState };
