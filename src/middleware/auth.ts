import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
  role?: string;
}

const SECRET = process.env.JWT_SECRET as string;
if (!SECRET) {
  throw new Error('JWT_SECRET not set in .env');
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || (req.cookies && (req.cookies.token || req.cookies['Authorization']));
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });

    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : (authHeader as string);

    const payload = jwt.verify(token, SECRET) as { userId: number; role?: string };
    req.userId = payload.userId;
    req.role = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
  next();
};
