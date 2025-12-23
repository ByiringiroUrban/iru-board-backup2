import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

// Get all available meetings (for Rooms tab - nested meetings)
export const getAllAvailableMeetings = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log('🏠 [GET ALL MEETINGS] Request received:', {
      userId,
      timestamp: new Date().toISOString()
    });

    // Get all meetings that are IN_PROGRESS or SCHEDULED (active meetings)
    const meetings = await prisma.meeting.findMany({
      where: {
        status: {
          in: ['IN_PROGRESS', 'SCHEDULED']
        }
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

    const duration = Date.now() - startTime;
    console.log('✅ [GET ALL MEETINGS] Retrieved meetings:', {
      count: meetings.length,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

    return res.json({ meetings });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [GET ALL MEETINGS] Error:', {
      error: err?.message,
      code: err?.code,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({ 
      message: err?.message || 'Server error',
      error: err?.code,
    });
  }
};

