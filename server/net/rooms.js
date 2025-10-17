
/**
 * Trivial room manager.
 * - Single default room until capacity reached, then create another.
 * - No persistence.
 */
const ROOM_CAPACITY = 8;

export function createRooms() {
  const rooms = new Map(); // roomId -> Set(playerIds)
  let nextRoomId = 1;

  function ensureRoom(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  }

  function findRoomWithSpace() {
    for (const [id, set] of rooms.entries()) {
      if (set.size < ROOM_CAPACITY) return id;
    }
    const id = `room-${nextRoomId++}`;
    rooms.set(id, new Set());
    return id;
  }

  function joinOrCreateRoom(playerId) {
    if (rooms.size === 0) ensureRoom(findRoomWithSpace());
    const roomId = findRoomWithSpace();
    rooms.get(roomId).add(playerId);
    return roomId;
  }

  function leaveRoom(playerId) {
    for (const [id, set] of rooms.entries()) {
      if (set.delete(playerId) && set.size === 0) {
        rooms.delete(id);
      }
    }
  }

  function roomIds() {
    return rooms.keys();
  }

  return { joinOrCreateRoom, leaveRoom, roomIds };
}
