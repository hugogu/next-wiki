import postgres from 'postgres';
import bcrypt from 'bcryptjs';

// Server-side admin bootstrap/recovery, run by whoever already has shell
// access to the container/host (docker exec, ssh, etc.) — a fundamentally
// different trust level than an anonymous web visitor. Deliberately bypasses
// /setup and /auth/register's public gating entirely, so it works even on a
// NEXT_WIKI_SEED=true deployment where an admin (the seed demo account, or
// any other) already exists and /setup has closed itself to the world.
//
// Usage:
//   node scripts/promote-admin.mjs <email> [password]
//
// - If <email> already has an account, promotes it to admin (and resets its
//   password if [password] is given).
// - Otherwise creates a new admin account. [password] is required in that case.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const [, , email, password] = process.argv;
if (!email) {
  console.error('Usage: node scripts/promote-admin.mjs <email> [password]');
  process.exit(1);
}
if (password && password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  const [existing] = await client`
    SELECT id FROM users WHERE email = ${email} AND deleted_at IS NULL
  `;

  if (existing) {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const [updated] = await client`
      UPDATE users
      SET role = 'admin',
          status = 'active',
          updated_at = now()
          ${passwordHash ? client`, password_hash = ${passwordHash}` : client``}
      WHERE id = ${existing.id}
      RETURNING email, role
    `;
    console.log(`[promote-admin] ${updated.email} is now ${updated.role}${password ? ' (password reset)' : ''}.`);
  } else {
    if (!password) {
      console.error(`[promote-admin] No account exists for ${email} — a password is required to create one.`);
      console.error('Usage: node scripts/promote-admin.mjs <email> <password>');
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await client`
      INSERT INTO users (email, password_hash, role, status)
      VALUES (${email}, ${passwordHash}, 'admin', 'active')
      RETURNING email, role
    `;
    console.log(`[promote-admin] Created ${created.email} as ${created.role}.`);
  }
} finally {
  await client.end();
}
