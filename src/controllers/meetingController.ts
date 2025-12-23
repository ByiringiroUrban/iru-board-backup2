import { Request, Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

export const createMeeting = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { title, description, boardroom } = req.body;
    const userId = req.userId;

    console.log('📅 [CREATE MEETING] Request received:', {
      title,
      boardroom,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!title || !boardroom) {
      console.error('❌ [CREATE MEETING] Missing required fields:', { title: !!title, boardroom: !!boardroom });
      return res.status(400).json({ message: 'Title and boardroom are required' });
    }

    if (!userId) {
      console.error('❌ [CREATE MEETING] Unauthorized - no userId');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log('📅 [CREATE MEETING] Creating meeting in database...');

    // Create meeting with IN_PROGRESS status (immediate start)
    // We'll use a temporary URL and update it after creation with the actual meeting ID
    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description || null,
        boardroom,
        status: 'IN_PROGRESS',
        startTime: new Date(),
        createdById: userId,
        meetingUrl: null // Temporary, will be updated
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      }
    });

    console.log('✅ [CREATE MEETING] Meeting created:', {
      meetingId: meeting.id,
      title: meeting.title,
      status: meeting.status,
      createdBy: meeting.createdBy.email
    });

    // Generate the join link using the meeting ID
    const joinLink = `/meeting/${meeting.id}`;
    
    console.log('📅 [CREATE MEETING] Updating meeting with join link:', joinLink);
    
    // Update meeting with the proper meetingUrl
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { meetingUrl: joinLink }
    });

    const duration = Date.now() - startTime;
    console.log('✅ [CREATE MEETING] Meeting creation completed:', {
      meetingId: updatedMeeting.id,
      joinLink,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

    return res.status(201).json({ 
      meeting: {
        id: updatedMeeting.id,
        title: updatedMeeting.title,
        description: updatedMeeting.description,
        boardroom: updatedMeeting.boardroom,
        status: updatedMeeting.status,
        startTime: updatedMeeting.startTime,
        meetingUrl: joinLink,
        joinLink: joinLink,
        createdBy: meeting.createdBy
      }
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [CREATE MEETING] Error:', {
      error: err?.message,
      code: err?.code,
      stack: err?.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    // If Meeting table doesn't exist or Prisma client not regenerated
    if (err?.code === 'P2021' || err?.code === 'P2001' || err?.message?.includes('does not exist') || err?.message?.includes('Unknown model') || err?.message?.includes('Meeting')) {
      return res.status(500).json({ 
        message: 'Meeting table not found. Please stop the server, run "npx prisma generate" in the backend directory, then restart the server.',
        error: 'P2021',
        hint: 'The Prisma client needs to be regenerated to include the Meeting model'
      });
    }
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

export const scheduleMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, boardroom, startTime, endTime } = req.body;
    const userId = req.userId;

    if (!title || !boardroom || !startTime) {
      return res.status(400).json({ message: 'Title, boardroom, and start time are required' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate start time is in the future
    const start = new Date(startTime);
    if (start < new Date()) {
      return res.status(400).json({ message: 'Start time must be in the future' });
    }

    // Create scheduled meeting with proper meeting URL
    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description || null,
        boardroom,
        status: 'SCHEDULED',
        startTime: start,
        endTime: endTime ? new Date(endTime) : null,
        createdById: userId,
        meetingUrl: `/meeting/${Date.now()}-${Math.random().toString(36).substring(7)}`
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      }
    });

    // Generate the join link using the meeting ID
    const joinLink = `/meeting/${meeting.id}`;

    return res.status(201).json({ 
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        boardroom: meeting.boardroom,
        status: meeting.status,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        meetingUrl: joinLink,
        joinLink: joinLink,
        createdBy: meeting.createdBy
      }
    });
  } catch (err: any) {
    console.error('Create meeting error:', err);
    // If Meeting table doesn't exist or Prisma client not regenerated
    if (err?.code === 'P2021' || err?.code === 'P2001' || err?.message?.includes('does not exist') || err?.message?.includes('Unknown model') || err?.message?.includes('Meeting')) {
      return res.status(500).json({ 
        message: 'Meeting table not found. Please stop the server, run "npx prisma generate" in the backend directory, then restart the server.',
        error: 'P2021',
        hint: 'The Prisma client needs to be regenerated to include the Meeting model'
      });
    }
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

export const getMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        createdById: userId
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({ meetings });
  } catch (err: any) {
    console.error('Create meeting error:', err);
    // If Meeting table doesn't exist or Prisma client not regenerated
    if (err?.code === 'P2021' || err?.code === 'P2001' || err?.message?.includes('does not exist') || err?.message?.includes('Unknown model') || err?.message?.includes('Meeting')) {
      return res.status(500).json({ 
        message: 'Meeting table not found. Please stop the server, run "npx prisma generate" in the backend directory, then restart the server.',
        error: 'P2021',
        hint: 'The Prisma client needs to be regenerated to include the Meeting model'
      });
    }
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

export const getMeetingById = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const userId = req.userId;

    console.log('🔍 [GET MEETING] Request received:', {
      meetingId: id,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!userId) {
      console.error('❌ [GET MEETING] Unauthorized - no userId');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      }
    });

    if (!meeting) {
      console.error('❌ [GET MEETING] Meeting not found:', id);
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Allow users to join meetings created by others
    // In a real app, you might check for admin role, shared access, or meeting permissions
    // For now, if the meeting exists and user is authenticated, they can join
    
    const duration = Date.now() - startTime;
    console.log('✅ [GET MEETING] Meeting retrieved:', {
      meetingId: meeting.id,
      title: meeting.title,
      status: meeting.status,
      createdBy: meeting.createdBy.email,
      requestedBy: userId,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    return res.json({ meeting });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [GET MEETING] Error:', {
      error: err?.message,
      code: err?.code,
      stack: err?.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    // If Meeting table doesn't exist or Prisma client not regenerated
    if (err?.code === 'P2021' || err?.code === 'P2001' || err?.message?.includes('does not exist') || err?.message?.includes('Unknown model') || err?.message?.includes('Meeting')) {
      return res.status(500).json({ 
        message: 'Meeting table not found. Please stop the server, run "npx prisma generate" in the backend directory, then restart the server.',
        error: 'P2021',
        hint: 'The Prisma client needs to be regenerated to include the Meeting model'
      });
    }
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

export const updateMeetingStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const validStatuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id }
    });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.createdById !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: { 
        status,
        ...(status === 'IN_PROGRESS' && !meeting.startTime ? { startTime: new Date() } : {}),
        ...(status === 'COMPLETED' ? { endTime: new Date() } : {})
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      }
    });

    return res.json({ meeting: updatedMeeting });
  } catch (err: any) {
    console.error('Create meeting error:', err);
    // If Meeting table doesn't exist or Prisma client not regenerated
    if (err?.code === 'P2021' || err?.code === 'P2001' || err?.message?.includes('does not exist') || err?.message?.includes('Unknown model') || err?.message?.includes('Meeting')) {
      return res.status(500).json({ 
        message: 'Meeting table not found. Please stop the server, run "npx prisma generate" in the backend directory, then restart the server.',
        error: 'P2021',
        hint: 'The Prisma client needs to be regenerated to include the Meeting model'
      });
    }
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
};

