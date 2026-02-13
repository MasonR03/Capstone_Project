/**
 * Optional snapshot of UI-ish state; safe to ignore on the client if unused.
 */
function emitUiState(io, players, gameState) {
  io.emit('uiSnapshot', {
    playerCount: Object.keys(players).length,
    ...(gameState || {}),
    ts: Date.now()
  });
}

module.exports = { emitUiState };
