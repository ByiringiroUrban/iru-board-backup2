import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userName?: string;
  meetingId?: string;
}

const SECRET = process.env.JWT_SECRET as string;
if (!SECRET) {
  throw new Error('JWT_SECRET not set in .env');
}

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all localhost origins in development
        if (process.env.NODE_ENV !== 'production') {
          if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
          }
        }
        
        const allowedOrigins = [
          process.env.FRONTEND_URL || 'http://localhost:8080',
          process.env.FRONTEND_URL_ALT || 'http://localhost:8081',
          'http://localhost:5173',
          'http://localhost:3000',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:3000',
        ];
        
        if (origin && allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.warn('⚠️ [SOCKET] Connection rejected: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const payload = jwt.verify(token, SECRET) as { userId: number; role?: string };
      socket.userId = payload.userId;
      console.log('✅ [SOCKET] Authenticated user:', payload.userId);
      next();
    } catch (err) {
      console.error('❌ [SOCKET] Authentication failed:', err);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('🔌 [SOCKET] Client connected:', socket.id, 'User ID:', socket.userId);

    // Join meeting room
    socket.on('join-meeting', async (data: { meetingId: string; userName: string }) => {
      try {
        const { meetingId, userName } = data;
        
        if (!meetingId) {
          socket.emit('error', { message: 'Meeting ID is required' });
          return;
        }

        socket.meetingId = meetingId;
        socket.userName = userName || `User ${socket.userId}`;
        
        const roomName = `meeting-${meetingId}`;
        await socket.join(roomName);
        
        console.log(`✅ [SOCKET] User ${socket.userId} (${socket.userName}) joined meeting: ${meetingId}`);
        
        // Notify others in the room
        socket.to(roomName).emit('user-joined', {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date().toISOString(),
        });

        // Send confirmation to the user
        socket.emit('joined-meeting', {
          meetingId,
          roomName,
          message: 'Successfully joined meeting',
        });
      } catch (error: any) {
        console.error('❌ [SOCKET] Error joining meeting:', error);
        socket.emit('error', { message: error?.message || 'Failed to join meeting' });
      }
    });

    // Handle chat messages
    socket.on('send-message', async (data: { message: string; meetingId: string }) => {
      try {
        const { message, meetingId } = data;
        
        if (!message || !message.trim()) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }

        if (!meetingId && !socket.meetingId) {
          socket.emit('error', { message: 'Meeting ID is required' });
          return;
        }

        const roomId = meetingId || socket.meetingId;
        const roomName = `meeting-${roomId}`;
        const userName = socket.userName || `User ${socket.userId}`;
        
        // Save message to database
        let savedMessage;
        try {
          savedMessage = await prisma.chatMessage.create({
            data: {
              meetingId: roomId,
              userId: socket.userId!,
              userName: userName,
              message: message.trim(),
            },
          });
          console.log(`💾 [SOCKET] Message saved to database:`, savedMessage.id);
        } catch (dbError: any) {
          console.error('❌ [SOCKET] Database error saving message:', dbError);
          // Continue to broadcast even if DB save fails
        }
        
        const messageData = {
          id: savedMessage?.id || Date.now().toString(),
          userId: socket.userId,
          userName: userName,
          message: message.trim(),
          meetingId: roomId,
          timestamp: savedMessage?.createdAt.toISOString() || new Date().toISOString(),
        };

        console.log(`💬 [SOCKET] Message from ${userName} in ${roomName}:`, message);

        // Broadcast to all users in the meeting room (including sender)
        io.to(roomName).emit('new-message', messageData);
      } catch (error: any) {
        console.error('❌ [SOCKET] Error sending message:', error);
        socket.emit('error', { message: error?.message || 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing', (data: { meetingId: string; isTyping: boolean }) => {
      const { meetingId, isTyping } = data;
      const roomName = `meeting-${meetingId || socket.meetingId}`;
      
      if (roomName) {
        socket.to(roomName).emit('user-typing', {
          userId: socket.userId,
          userName: socket.userName,
          isTyping,
        });
      }
    });

    // Handle raise hand
    socket.on('raise-hand', (data: { meetingId: string; isRaised: boolean }) => {
      const { meetingId, isRaised } = data;
      const roomName = `meeting-${meetingId || socket.meetingId}`;
      
      if (roomName) {
        console.log(`✋ [SOCKET] Hand ${isRaised ? 'raised' : 'lowered'} by ${socket.userName}`);
        io.to(roomName).emit('hand-raised', {
          userId: socket.userId,
          userName: socket.userName,
          isRaised,
        });
      }
    });

    // Handle reactions
    socket.on('reaction', (data: { meetingId: string; emoji: string }) => {
      const { meetingId, emoji } = data;
      const roomName = `meeting-${meetingId || socket.meetingId}`;
      
      if (roomName) {
        console.log(`😊 [SOCKET] Reaction ${emoji} from ${socket.userName}`);
        io.to(roomName).emit('reaction', {
          userId: socket.userId,
          userName: socket.userName,
          emoji,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 [SOCKET] Client disconnected:', socket.id, 'User ID:', socket.userId);
      
      if (socket.meetingId) {
        const roomName = `meeting-${socket.meetingId}`;
        socket.to(roomName).emit('user-left', {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('❌ [SOCKET] Socket error:', error);
    });
  });

  return io;
}

