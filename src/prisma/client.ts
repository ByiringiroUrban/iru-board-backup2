import { PrismaClient } from '@prisma/client';

declare global {
  // allow hot-reloading in dev to reuse a single PrismaClient instance
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;
