import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
let postgresAvailable = true;

export function disablePostgres(): void {
  postgresAvailable = false;
  prismaClient = null;
}

export function hasPostgresConnection(): boolean {
  if (!postgresAvailable) return false;
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') return false;
  // If the DATABASE_URL contains unreplaced template placeholders like <DB_USER> or <password>
  if (url.includes('<') || url.includes('>')) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('postgres')) return false;
    if (!parsed.hostname || parsed.hostname.includes('<') || parsed.hostname.includes('>')) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Returns a singleton instance of PrismaClient if DATABASE_URL is configured and valid.
 * Returns null if DATABASE_URL is not set or invalid (falling back to SQLite).
 */
export function getPrisma(): PrismaClient | null {
  if (!hasPostgresConnection()) {
    return null;
  }
  if (!prismaClient) {
    try {
      prismaClient = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    } catch (e: any) {
      console.warn('[PRISMA] Could not instantiate PrismaClient, disabling Postgres:', e.message);
      disablePostgres();
      return null;
    }
  }
  return prismaClient;
}
