import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';

const app = express();

app.use(express.json());
app.use(cookieParser());
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:8080',
  process.env.FRONTEND_URL_ALT || 'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://www.iruboard.com',
  'https://iruboard.com',
];

// Normalize origin by removing trailing slash for comparison
const normalizeOrigin = (origin: string) => origin.replace(/\/$/, '');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // Normalize and check origin
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);
    
    if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

app.use('/api/auth', authRoutes);

// basic error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  return res.status(500).json({ message: 'Server error' });
});

export default app;
