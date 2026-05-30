import PgBoss from "pg-boss";
import { env } from "@/server/config/env";

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      // Retain completed job records for 7 days for admin visibility.
      deleteAfterDays: 7,
      archiveCompletedAfterSeconds: 60 * 60 * 24, // 24h
      monitorStateIntervalSeconds: 30,
      // Avoid pg-boss creating its own table prefix collision.
      schema: "pgboss",
    });
  }
  return boss;
}

export async function startBoss(): Promise<PgBoss> {
  const b = getBoss();
  await b.start();
  return b;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}
