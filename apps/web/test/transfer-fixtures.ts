import { randomUUID, createHash } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';

export async function createTransferAdmin(prefix = 'transfer-admin') {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `${prefix}-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  return { user: user!, ctx: buildUserCtx(user!.id, 'admin') };
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
