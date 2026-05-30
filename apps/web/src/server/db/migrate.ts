import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closeDb } from "./client";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(): Promise<void> {
  console.info("[migrate] Starting database migration...");

  const db = getDb();
  const migrationsFolder = path.join(__dirname, "migrations");

  await migrate(db, { migrationsFolder });
  console.info("[migrate] Migrations completed successfully");
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("[migrate] Migration failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void closeDb();
  });
