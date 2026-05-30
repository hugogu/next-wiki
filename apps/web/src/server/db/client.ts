import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/server/config/env";
import * as authSchema from "./schema/auth";
import * as wikiSchema from "./schema/wiki";
import * as aiSchema from "./schema/ai";

const schema = { ...authSchema, ...wikiSchema, ...aiSchema };

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getDb() {
  if (!db) {
    pool = createPool();
    db = drizzle(pool, { schema });
  }
  return db;
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
    db = drizzle(pool, { schema });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
