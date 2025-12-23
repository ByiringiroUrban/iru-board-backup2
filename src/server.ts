import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { initializeSocketIO } from './socket/socketServer';

const port = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = initializeSocketIO(httpServer);

// Store io instance for potential use in routes
app.set('io', io);

httpServer.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
  console.log(`🔌 Socket.io server initialized`);
});
