import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user's meetings
    const userMeetings = await prisma.meeting.findMany({
      where: {
        createdById: userId
      },
      include: {
        chatMessages: true,
        documents: true
      }
    });

    // Calculate statistics
    const now = new Date();
    const upcomingMeetings = userMeetings.filter(
      meeting => meeting.status === 'SCHEDULED' && 
      meeting.startTime && 
      new Date(meeting.startTime) > now
    ).length;

    const totalDocuments = userMeetings.reduce(
      (sum, meeting) => sum + meeting.documents.length,
      0
    );

    const totalMeetings = userMeetings.length;
    const inProgressMeetings = userMeetings.filter(
      meeting => meeting.status === 'IN_PROGRESS'
    ).length;

    const completedMeetings = userMeetings.filter(
      meeting => meeting.status === 'COMPLETED'
    ).length;

    // Get recent meetings (last 10)
    const recentMeetings = await prisma.meeting.findMany({
      where: {
        createdById: userId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10,
      include: {
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Get meetings by status for chart
    const meetingsByStatus = {
      SCHEDULED: userMeetings.filter(m => m.status === 'SCHEDULED').length,
      IN_PROGRESS: userMeetings.filter(m => m.status === 'IN_PROGRESS').length,
      COMPLETED: userMeetings.filter(m => m.status === 'COMPLETED').length,
      CANCELLED: userMeetings.filter(m => m.status === 'CANCELLED').length
    };

    // Get meetings by boardroom
    const boardroomCounts = userMeetings.reduce((acc: any, meeting) => {
      const boardroom = meeting.boardroom || 'Other';
      acc[boardroom] = (acc[boardroom] || 0) + 1;
      return acc;
    }, {});

    // Get meetings over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const meetingsOverTime = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        createdAt: {
          gte: thirtyDaysAgo
        }
      },
      select: {
        createdAt: true,
        status: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Group by date
    const meetingsByDate: { [key: string]: number } = {};
    meetingsOverTime.forEach(meeting => {
      const date = new Date(meeting.createdAt).toISOString().split('T')[0];
      meetingsByDate[date] = (meetingsByDate[date] || 0) + 1;
    });

    // Get chat messages count
    const totalChatMessages = userMeetings.reduce(
      (sum, meeting) => sum + meeting.chatMessages.length,
      0
    );

    // Get all users count (for team members - this could be improved with a Team model)
    const totalUsers = await prisma.user.count();

    return res.json({
      stats: {
        upcomingMeetings,
        totalDocuments,
        totalMeetings,
        inProgressMeetings,
        completedMeetings,
        totalChatMessages,
        totalUsers // This is a placeholder - in a real app, you'd have team members
      },
      recentMeetings: recentMeetings.map(meeting => ({
        id: meeting.id,
        title: meeting.title,
        boardroom: meeting.boardroom,
        status: meeting.status,
        startTime: meeting.startTime,
        createdAt: meeting.createdAt,
        createdBy: meeting.createdBy
      })),
      charts: {
        meetingsByStatus,
        boardroomCounts,
        meetingsOverTime: Object.entries(meetingsByDate).map(([date, count]) => ({
          date,
          count
        }))
      }
    });
  } catch (err: any) {
    console.error('Get dashboard stats error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};


