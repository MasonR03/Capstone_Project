function emitScore(target, scores) {
  // accepts either io or socket
  target.emit('updateScore', scores);
}


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
