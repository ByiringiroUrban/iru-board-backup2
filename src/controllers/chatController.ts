import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';

export const getChatMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // meeting ID
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!id) {
      return res.status(400).json({ message: 'Meeting ID is required' });
    }

    console.log('💬 [CHAT] Fetching messages for meeting:', id);

    // Verify meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id },
    });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Get all chat messages for this meeting, ordered by creation time
    const messages = await prisma.chatMessage.findMany({
      where: {
        meetingId: id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        userId: true,
        userName: true,
        message: true,
        createdAt: true,
      },
    });

    console.log(`✅ [CHAT] Retrieved ${messages.length} messages for meeting ${id}`);

    // Format messages for frontend
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      userId: msg.userId,
      userName: msg.userName,
      message: msg.message,
      time: new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: msg.createdAt.toISOString(),
    }));

    return res.json({ messages: formattedMessages });
  } catch (err: any) {
    console.error('❌ [CHAT] Error fetching messages:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code,
    });
  }
};

