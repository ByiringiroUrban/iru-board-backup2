import { Router } from 'express';
import { register, login, me } from '../controllers/authController';
import { createPayment, verifyPayment, getSubscriptions, cancelSubscription, handleWebhook } from '../controllers/paymentController';
import { createMeeting, scheduleMeeting, getMeetings, getMeetingById, updateMeetingStatus } from '../controllers/meetingController';
import { getAllAvailableMeetings } from '../controllers/getAllMeetings';
import { generateToken } from '../controllers/agoraController';
import { getChatMessages } from '../controllers/chatController';
import { uploadDocument, getDocuments, getAllDocuments, downloadDocument, deleteDocument, uploadMiddleware } from '../controllers/documentController';
import { generateMeetingNotes } from '../controllers/notesController';
import { getDashboardStats } from '../controllers/dashboardController';
import { getTeamMembers } from '../controllers/teamController';
import { getInsights } from '../controllers/insightsController';
import prisma from '../prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);
// Example admin-only route placeholder
router.get('/admin/ping', authenticate, requireAdmin, (req, res) => res.json({ ok: true }));

// Update profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, company } = req.body;
    const id = (req as any).userId as number;
    const user = await prisma.user.update({ where: { id }, data: { firstName, lastName, company } });
    return res.json({ user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, company: user.company, role: (user as any).role } });
  } catch (e) {
    return res.status(400).json({ message: 'Failed to update profile' });
  }
});

// Update password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Password too short' });
    const id = (req as any).userId as number;
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ message: 'Failed to update password' });
  }
});

// Payment routes
router.post('/payment/create', authenticate, createPayment);
router.post('/payment/verify', authenticate, verifyPayment);
router.get('/subscriptions', authenticate, getSubscriptions);
router.put('/subscription/cancel', authenticate, cancelSubscription);
router.post('/payment/webhook', handleWebhook);

// Meeting routes
router.post('/meetings/create', authenticate, createMeeting);
router.post('/meetings/schedule', authenticate, scheduleMeeting);
router.get('/meetings', authenticate, getMeetings);
router.get('/meetings/all', authenticate, getAllAvailableMeetings); // Get all available meetings for Rooms tab
router.get('/meetings/:id', authenticate, getMeetingById);
router.put('/meetings/:id/status', authenticate, updateMeetingStatus);

// Agora token generation
router.post('/agora/token', authenticate, generateToken);

// Chat routes
router.get('/meetings/:id/messages', authenticate, getChatMessages);

// Document routes
router.post('/meetings/:meetingId/documents', authenticate, uploadMiddleware, uploadDocument);
router.get('/meetings/:meetingId/documents', authenticate, getDocuments);
router.get('/documents/:id/download', authenticate, downloadDocument);
router.delete('/documents/:id', authenticate, deleteDocument);

// Notes routes
router.get('/meetings/:meetingId/notes', authenticate, generateMeetingNotes);

// Dashboard routes
router.get('/dashboard/stats', authenticate, getDashboardStats);

// Documents routes (all documents)
router.get('/documents', authenticate, getAllDocuments);

// Team routes
router.get('/team', authenticate, getTeamMembers);

// Insights routes
router.get('/insights', authenticate, getInsights);

export default router;
