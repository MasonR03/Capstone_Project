
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createGame } from "./game/engine.js";
import { createRooms } from "./net/rooms.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve client
app.use(express.static("client"));

const rooms = createRooms();
const game = createGame(rooms);

io.on("connection", (socket) => {
  const playerId = socket.id;
  const roomId = rooms.joinOrCreateRoom(playerId);
  console.log(`Player ${playerId} connected -> room ${roomId}`);

  socket.join(roomId);
  game.addPlayer(roomId, playerId);

  socket.on("input", (input) => {
    game.queueInput(playerId, input);
  });

  socket.on("disconnect", () => {
    console.log(`Player ${playerId} disconnected`);
    game.removePlayer(playerId);
    rooms.leaveRoom(playerId);
  });
});

// Broadcast snapshots at game.tickHz
setInterval(() => {
  for (const roomId of rooms.roomIds()) {
    const snapshot = game.snapshot(roomId);
    io.to(roomId).emit("snapshot", snapshot);
  }
}, Math.round(1000 / 15)); // snapshot rate ~15 Hz to start

server.listen(PORT, () => {
  console.log(`Space Arena server listening on http://localhost:${PORT}`);
});
