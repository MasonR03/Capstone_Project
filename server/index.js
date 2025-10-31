const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ------------------------------
// Serve your public client files
// ------------------------------
// (update the path if public is outside server/)
app.use(express.static(path.join(__dirname, 'public')));

// Serve shared assets (ships, stars, etc.)
app.use(
  '/assets',
  express.static(path.join(__dirname, 'authoritative_server', 'assets'))
);

// ------------------------------
// Default route for the browser game
// ------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------------------
// Socket.IO events
// ------------------------------
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Example: broadcast movement or actions
  socket.on('playerMove', (data) => {
    socket.broadcast.emit('playerMove', data);
  });
});

// ------------------------------
// Start the server
// ------------------------------
const PORT = 8082;
server.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
});
