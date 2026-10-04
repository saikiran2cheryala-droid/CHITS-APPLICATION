import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;

/**
 * Returns a singleton instance of PrismaClient if DATABASE_URL is configured.
 * Returns null if DATABASE_URL is not set (falling back to SQLite).
 */
export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prismaClient;
}

export function hasPostgresConnection(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '');
}
