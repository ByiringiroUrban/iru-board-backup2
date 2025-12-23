import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET as string;
if (!SECRET) {
  throw new Error('JWT_SECRET not set in .env');
}

export function signToken(userId: number, role?: string) {
  return jwt.sign({ userId, role }, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, SECRET) as { userId: number };
}
