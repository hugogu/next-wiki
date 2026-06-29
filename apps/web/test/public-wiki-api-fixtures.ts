import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as apiKeys from '@/server/services/api-keys';
import * as pages from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';

export async function ensurePublicApiDefaultSpace() {
  let space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
  if (!space) {
    const [created] = await db
      .insert(schema.spaces)
      .values({ slug: 'default', name: 'Default', anonymousRead: true })
      .returning();
    space = created;
  }
  return space;
}

export async function createPublicApiUser(email: string, role: 'reader' | 'editor' | 'admin') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create public API fixture user');
  return user;
}

export async function createPublicApiKey(user: { id: string; role: 'reader' | 'editor' | 'admin' }, scopes: Array<'view' | 'create' | 'edit' | 'delete'>) {
  return apiKeys.create(buildUserCtx(user.id, user.role), `public-api-${Date.now()}`, scopes);
}

export async function createPublishedFixturePage(user: { id: string; role: 'reader' | 'editor' | 'admin' }, input: { path: string; title: string; contentSource: string }) {
  const ctx = buildUserCtx(user.id, user.role);
  const created = await pages.create(ctx, input);
  const draft = await pages.getForEdit(ctx, input.path);
  if (!draft) throw new Error('Failed to read fixture draft');
  await revisions.publish(ctx, { path: input.path, version: draft.latestVersion });
  return created;
}
