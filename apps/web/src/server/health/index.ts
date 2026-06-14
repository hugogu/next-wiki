import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export async function checkHealth(): Promise<{ ok: boolean; services: Record<string, boolean> }> {
  const services: Record<string, boolean> = {
    database: false,
  };

  try {
    await db.execute(sql`select 1`);
    services.database = true;
  } catch {
    services.database = false;
  }

  return {
    ok: Object.values(services).every(Boolean),
    services,
  };
}

export async function checkReadiness(): Promise<{ ok: boolean; services: Record<string, boolean> }> {
  return checkHealth();
}
