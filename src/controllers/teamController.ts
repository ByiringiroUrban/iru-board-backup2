import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';

export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get all users (team members)
    // In a real app, you might want to filter by company or organization
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            meetings: true,
            documents: true,
            chatMessages: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({
      teamMembers: users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        company: user.company || 'N/A',
        role: user.role,
        createdAt: user.createdAt,
        stats: {
          meetings: user._count.meetings,
          documents: user._count.documents,
          messages: user._count.chatMessages
        }
      }))
    });
  } catch (err: any) {
    console.error('Get team members error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

