import { RtcTokenBuilder, RtcRole } from 'agora-token';

export interface AgoraTokenParams {
  channelName: string;
  uid: number | string;
  role?: 'publisher' | 'subscriber';
  expireTime?: number; // in seconds, default 24 hours
}

export function generateAgoraToken(params: AgoraTokenParams): string {
  console.log('🔐 [AGORA TOKEN UTIL] Starting token generation:', {
    channelName: params.channelName,
    uid: params.uid,
    role: params.role,
    expireTime: params.expireTime
  });

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    console.error('❌ [AGORA TOKEN UTIL] Missing credentials:', {
      hasAppId: !!appId,
      hasAppCertificate: !!appCertificate
    });
    throw new Error('Agora credentials not configured. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env');
  }

  const { channelName, uid, role = 'publisher', expireTime = 86400 } = params;
  
  // Convert uid to number if it's a string
  const uidNumber = typeof uid === 'string' ? parseInt(uid) || 0 : uid;
  
  console.log('🔐 [AGORA TOKEN UTIL] Token params processed:', {
    channelName,
    originalUid: uid,
    uidNumber,
    role,
    expireTime
  });
  
  // Map role to Agora RtcRole
  const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  
  // Current timestamp in seconds
  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTime + expireTime;

  console.log('🔐 [AGORA TOKEN UTIL] Building token with:', {
    appId: appId.substring(0, 8) + '...',
    channelName,
    uidNumber,
    rtcRole: rtcRole === RtcRole.PUBLISHER ? 'PUBLISHER' : 'SUBSCRIBER',
    currentTime,
    privilegeExpiredTs
  });

  // Generate token
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uidNumber,
    rtcRole,
    privilegeExpiredTs
  );

  console.log('✅ [AGORA TOKEN UTIL] Token generated successfully:', {
    tokenLength: token.length,
    tokenPreview: token.substring(0, 20) + '...'
  });

  return token;
}


