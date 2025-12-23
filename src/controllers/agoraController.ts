import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateAgoraToken } from '../utils/agoraToken';

export const generateToken = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { channelName, uid, role } = req.body;
    const userId = req.userId;

    console.log('🔑 [AGORA TOKEN] Request received:', {
      channelName,
      requestedUid: uid,
      userId,
      role,
      timestamp: new Date().toISOString()
    });

    if (!channelName) {
      console.error('❌ [AGORA TOKEN] Missing channel name');
      return res.status(400).json({ message: 'Channel name is required' });
    }

    if (!userId) {
      console.error('❌ [AGORA TOKEN] Unauthorized - no userId');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Use user ID as UID if not provided, or use provided UID
    const userUid = uid || userId;

    console.log('🔑 [AGORA TOKEN] Generating token with params:', {
      channelName,
      uid: userUid,
      role: role || 'publisher',
      appId: process.env.AGORA_APP_ID ? '***configured***' : 'MISSING',
      appCertificate: process.env.AGORA_APP_CERTIFICATE ? '***configured***' : 'MISSING'
    });

    try {
      const token = generateAgoraToken({
        channelName,
        uid: userUid,
        role: role || 'publisher',
        expireTime: 86400 // 24 hours
      });

      const duration = Date.now() - startTime;
      console.log('✅ [AGORA TOKEN] Token generated successfully:', {
        channelName,
        uid: userUid,
        tokenLength: token.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });

      return res.json({
        token,
        appId: process.env.AGORA_APP_ID,
        channelName,
        uid: userUid
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ [AGORA TOKEN] Token generation error:', {
        error: error?.message,
        stack: error?.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
      return res.status(500).json({
        message: error?.message || 'Failed to generate Agora token',
        error: 'Token generation failed'
      });
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [AGORA TOKEN] Generate token error:', {
      error: err?.message,
      stack: err?.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      message: err?.message || 'Server error'
    });
  }
};


