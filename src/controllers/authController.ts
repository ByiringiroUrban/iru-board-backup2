import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/client';
import { signToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';
import { Role, PrismaClientInitializationError } from '@prisma/client';

export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, company } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    
    // Set ADMIN role for specific email
    const isAdminEmail = email.toLowerCase() === 'irubusinessgroup@gmail.com';
    const role: Role = isAdminEmail ? Role.ADMIN : Role.USER;
    
    const user = await prisma.user.create({
      data: { 
        firstName, 
        lastName, 
        email, 
        password: hashed, 
        company,
        role
      },
    });

    const userRole = role;
    const token = signToken(user.id, userRole);
    const safeUser = { 
      id: user.id, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      email: user.email, 
      company: user.company, 
      role: userRole 
    };

    // Determine redirect path
    const redirectPath = isAdminEmail ? '/admin' : '/settings';

    return res.status(201).json({ user: safeUser, token, redirectPath });
  } catch (err: any) {
    console.error('Register error:', err);
    
    // Handle database connection errors specifically
    if (err instanceof PrismaClientInitializationError || err.name === 'PrismaClientInitializationError') {
      return res.status(503).json({ 
        message: 'Database connection failed',
        error: 'Cannot connect to database server. Please check your database configuration.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        help: 'Run "npm run test:db" to diagnose the issue'
      });
    }
    
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const userRole = (user as any).role || 'USER';
    const token = signToken(user.id, userRole);
    const safeUser = { 
      id: user.id, 
      firstName: user.firstName, 
      lastName: user.lastName, 
      email: user.email, 
      company: user.company, 
      role: userRole 
    };

    // Determine redirect path based on email
    const isAdminEmail = email.toLowerCase() === 'irubusinessgroup@gmail.com';
    const redirectPath = (isAdminEmail || userRole === 'ADMIN') ? '/admin' : '/settings';

    return res.json({ user: safeUser, token, redirectPath });
  } catch (err: any) {
    console.error('Login error:', err);
    
    // Handle database connection errors specifically
    if (err instanceof PrismaClientInitializationError || err.name === 'PrismaClientInitializationError') {
      return res.status(503).json({ 
        message: 'Database connection failed',
        error: 'Cannot connect to database server. Please check your database configuration.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        help: 'Run "npm run test:db" to diagnose the issue'
      });
    }
    
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const userRole = (user as any).role || 'USER';
    const safeUser = { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, company: user.company, role: userRole };
    return res.json({ user: safeUser });
  } catch (err: any) {
    console.error('Me endpoint error:', err);
    
    // Handle database connection errors specifically
    if (err instanceof PrismaClientInitializationError || err.name === 'PrismaClientInitializationError') {
      return res.status(503).json({ 
        message: 'Database connection failed',
        error: 'Cannot connect to database server. Please check your database configuration.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        help: 'Run "npm run test:db" to diagnose the issue'
      });
    }
    
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};
