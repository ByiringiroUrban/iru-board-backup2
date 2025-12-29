import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';

export const getInsights = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { timeRange = '30d' } = req.query;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get user's meetings
    const meetings = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        createdAt: {
          gte: startDate
        }
      },
      include: {
        chatMessages: true,
        documents: true
      }
    });

    // Calculate total meetings
    const totalMeetings = meetings.length;

    // Calculate total duration (estimate based on meeting status and time)
    // For completed meetings, calculate from startTime to endTime
    const completedMeetings = meetings.filter(m => m.status === 'COMPLETED' && m.startTime && m.endTime);
    let totalDuration = 0;
    completedMeetings.forEach(meeting => {
      if (meeting.startTime && meeting.endTime) {
        const duration = (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / (1000 * 60); // minutes
        totalDuration += duration;
      }
    });
    // For in-progress meetings, estimate average duration
    const inProgressMeetings = meetings.filter(m => m.status === 'IN_PROGRESS');
    totalDuration += inProgressMeetings.length * 30; // Estimate 30 minutes per in-progress meeting

    // Calculate average participants (based on chat messages - unique users per meeting)
    let totalParticipants = 0;
    meetings.forEach(meeting => {
      const uniqueParticipants = new Set(meeting.chatMessages.map(msg => msg.userId));
      totalParticipants += uniqueParticipants.size || 1; // At least 1 (the creator)
    });
    const averageParticipants = totalMeetings > 0 ? totalParticipants / totalMeetings : 0;

    // Get active users (users who have created meetings or sent messages)
    const activeUserIds = new Set<number>();
    meetings.forEach(meeting => {
      activeUserIds.add(meeting.createdById);
      meeting.chatMessages.forEach(msg => activeUserIds.add(msg.userId));
    });
    const activeUsers = activeUserIds.size;

    // Calculate meeting trends by month
    const meetingTrends: { [key: string]: number } = {};
    meetings.forEach(meeting => {
      const month = new Date(meeting.createdAt).toLocaleDateString('en-US', { month: 'short' });
      meetingTrends[month] = (meetingTrends[month] || 0) + 1;
    });

    // Convert to array format
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const meetingTrendsArray = months.map(month => ({
      month,
      count: meetingTrends[month] || 0
    })).filter(item => item.count > 0);

    // Calculate feature usage (based on actual usage)
    const totalDocuments = meetings.reduce((sum, m) => sum + m.documents.length, 0);
    const totalChatMessages = meetings.reduce((sum, m) => sum + m.chatMessages.length, 0);
    const meetingsWithDocuments = meetings.filter(m => m.documents.length > 0).length;
    const meetingsWithChat = meetings.filter(m => m.chatMessages.length > 0).length;

    const topFeatures = [
      { 
        name: 'Chat & Messaging', 
        usage: totalMeetings > 0 ? Math.round((meetingsWithChat / totalMeetings) * 100) : 0 
      },
      { 
        name: 'Document Sharing', 
        usage: totalMeetings > 0 ? Math.round((meetingsWithDocuments / totalMeetings) * 100) : 0 
      },
      { 
        name: 'Video Conferencing', 
        usage: totalMeetings > 0 ? Math.round((meetings.filter(m => m.status === 'IN_PROGRESS' || m.status === 'COMPLETED').length / totalMeetings) * 100) : 0 
      },
      { 
        name: 'Meeting Notes', 
        usage: totalMeetings > 0 ? Math.round((meetings.filter(m => m.documents.length > 0).length / totalMeetings) * 50) : 0 
      },
      { 
        name: 'Scheduled Meetings', 
        usage: totalMeetings > 0 ? Math.round((meetings.filter(m => m.status === 'SCHEDULED').length / totalMeetings) * 100) : 0 
      }
    ].sort((a, b) => b.usage - a.usage);

    // Calculate productivity score (based on various factors)
    let productivityScore = 0;
    if (totalMeetings > 0) {
      const completionRate = (meetings.filter(m => m.status === 'COMPLETED').length / totalMeetings) * 30;
      const engagementRate = (meetingsWithChat / totalMeetings) * 30;
      const documentUsageRate = (meetingsWithDocuments / totalMeetings) * 20;
      const activeMeetingRate = (meetings.filter(m => m.status === 'IN_PROGRESS' || m.status === 'COMPLETED').length / totalMeetings) * 20;
      productivityScore = Math.round(completionRate + engagementRate + documentUsageRate + activeMeetingRate);
    }

    // Get previous period data for comparison
    const previousStartDate = new Date(startDate);
    const previousEndDate = new Date(startDate);
    const periodLength = now.getTime() - startDate.getTime();
    previousStartDate.setTime(previousStartDate.getTime() - periodLength);
    
    const previousMeetings = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        createdAt: {
          gte: previousStartDate,
          lt: previousEndDate
        }
      }
    });

    const previousTotalMeetings = previousMeetings.length;
    const meetingsGrowth = previousTotalMeetings > 0 
      ? Math.round(((totalMeetings - previousTotalMeetings) / previousTotalMeetings) * 100)
      : totalMeetings > 0 ? 100 : 0;

    // Calculate duration growth
    const previousCompletedMeetings = previousMeetings.filter(m => m.status === 'COMPLETED' && m.startTime && m.endTime);
    let previousDuration = 0;
    previousCompletedMeetings.forEach(meeting => {
      if (meeting.startTime && meeting.endTime) {
        const duration = (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / (1000 * 60);
        previousDuration += duration;
      }
    });
    const durationGrowth = previousDuration > 0 
      ? Math.round(((totalDuration - previousDuration) / previousDuration) * 100)
      : totalDuration > 0 ? 100 : 0;

    // Calculate participants growth
    const previousParticipants = previousMeetings.length > 0 ? previousMeetings.length * 2 : 0; // Estimate
    const participantsGrowth = previousParticipants > 0
      ? Math.round(((averageParticipants - (previousParticipants / previousMeetings.length)) / (previousParticipants / previousMeetings.length)) * 100)
      : averageParticipants > 0 ? 100 : 0;

    return res.json({
      totalMeetings,
      totalDuration: Math.round(totalDuration),
      averageParticipants: Math.round(averageParticipants * 10) / 10,
      activeUsers,
      meetingTrends: meetingTrendsArray,
      topFeatures,
      productivityScore,
      growth: {
        meetings: meetingsGrowth,
        duration: durationGrowth,
        participants: participantsGrowth
      },
      breakdown: {
        scheduled: meetings.filter(m => m.status === 'SCHEDULED').length,
        inProgress: meetings.filter(m => m.status === 'IN_PROGRESS').length,
        completed: meetings.filter(m => m.status === 'COMPLETED').length,
        cancelled: meetings.filter(m => m.status === 'CANCELLED').length
      },
      productivityMetrics: {
        meetingEfficiency: totalMeetings > 0 ? Math.round((meetings.filter(m => m.status === 'COMPLETED').length / totalMeetings) * 100) : 0,
        timeManagement: totalDuration > 0 ? Math.round((totalDuration / (totalMeetings * 60)) * 100) : 0, // Efficiency based on average meeting duration
        teamEngagement: totalMeetings > 0 ? Math.round((meetingsWithChat / totalMeetings) * 100) : 0
      }
    });
  } catch (err: any) {
    console.error('Get insights error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

