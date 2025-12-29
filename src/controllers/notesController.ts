import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';

export const generateMeetingNotes = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!meetingId) {
      return res.status(400).json({ message: 'Meeting ID is required' });
    }

    // Fetch meeting details
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        },
        chatMessages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Generate notes content
    const notes = generateNotesContent(meeting);

    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-notes-${meetingId}-${Date.now()}.txt"`);
    
    // Send the notes as text
    return res.send(notes);
  } catch (err: any) {
    console.error('Generate notes error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

function generateNotesContent(meeting: any): string {
  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (start: Date | null, end: Date | null) => {
    if (!start) return 'N/A';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const durationMs = endTime - startTime;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  let notes = '';
  notes += '='.repeat(80) + '\n';
  notes += `MEETING NOTES\n`;
  notes += '='.repeat(80) + '\n\n';
  
  notes += `Title: ${meeting.title}\n`;
  if (meeting.description) {
    notes += `Description: ${meeting.description}\n`;
  }
  notes += `Boardroom: ${meeting.boardroom}\n`;
  notes += `Status: ${meeting.status}\n`;
  notes += `Start Time: ${formatDate(meeting.startTime)}\n`;
  if (meeting.endTime) {
    notes += `End Time: ${formatDate(meeting.endTime)}\n`;
  }
  notes += `Duration: ${calculateDuration(meeting.startTime, meeting.endTime)}\n`;
  notes += `Created By: ${meeting.createdBy.firstName} ${meeting.createdBy.lastName}`;
  if (meeting.createdBy.company) {
    notes += ` (${meeting.createdBy.company})`;
  }
  notes += '\n';
  notes += `Created At: ${formatDate(meeting.createdAt)}\n\n`;
  
  notes += '-'.repeat(80) + '\n';
  notes += `PARTICIPANTS\n`;
  notes += '-'.repeat(80) + '\n';
  
  // Get unique participants from chat messages
  const participants = new Map();
  meeting.chatMessages.forEach((msg: any) => {
    if (!participants.has(msg.userId)) {
      participants.set(msg.userId, {
        name: msg.userName,
        firstName: msg.user.firstName,
        lastName: msg.user.lastName
      });
    }
  });
  
  if (participants.size > 0) {
    participants.forEach((participant) => {
      notes += `• ${participant.name}\n`;
    });
  } else {
    notes += 'No participants recorded\n';
  }
  notes += `Total Participants: ${participants.size}\n\n`;
  
  notes += '-'.repeat(80) + '\n';
  notes += `CHAT TRANSCRIPT\n`;
  notes += '-'.repeat(80) + '\n\n';
  
  if (meeting.chatMessages.length > 0) {
    meeting.chatMessages.forEach((msg: any) => {
      const timestamp = formatTime(msg.createdAt);
      notes += `[${timestamp}] ${msg.userName}: ${msg.message}\n`;
    });
  } else {
    notes += 'No chat messages recorded.\n';
  }
  
  notes += '\n';
  notes += '-'.repeat(80) + '\n';
  notes += `SUMMARY\n`;
  notes += '-'.repeat(80) + '\n';
  notes += `Total Messages: ${meeting.chatMessages.length}\n`;
  notes += `Meeting Status: ${meeting.status}\n`;
  
  if (meeting.chatMessages.length > 0) {
    const firstMessage = meeting.chatMessages[0];
    const lastMessage = meeting.chatMessages[meeting.chatMessages.length - 1];
    notes += `First Message: ${formatTime(firstMessage.createdAt)}\n`;
    notes += `Last Message: ${formatTime(lastMessage.createdAt)}\n`;
  }
  
  notes += '\n';
  notes += '='.repeat(80) + '\n';
  notes += `Generated on: ${formatDate(new Date())}\n`;
  notes += '='.repeat(80) + '\n';
  
  return notes;
}


