import { PrismaClient } from '@prisma/client';

declare global {
  // allow hot-reloading in dev to reuse a single PrismaClient instance
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Enhanced Prisma Client with better error handling
const prisma = global.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;
