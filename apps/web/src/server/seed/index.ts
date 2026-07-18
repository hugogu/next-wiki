import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { seedBuiltinSystemThemes } from '@/server/services/system-theme';
import { DEFAULT_SPACE_SLUG } from '@/server/services/spaces';
import { WELCOME_PAGE_SOURCE } from '@/server/services/setup-sample-page-definitions';
import { env } from '@/server/config';

/**
 * Ensure exactly one active Database primary backend exists. This is core
 * infrastructure (not sample data), so it is seeded on every boot regardless of
 * the demo-seed guard, and is idempotent via the unique (type, purpose) index.
 */
export async function seedDefaultStorageBackend() {
  await db
    .insert(schema.storageBackends)
    .values({
      type: 'database',
      purpose: 'primary',
      isActive: true,
      replicaState: 'enabled',
      config: {},
    })
    .onConflictDoNothing({
      target: [schema.storageBackends.type, schema.storageBackends.purpose],
    });
}

/**
 * Ensure the default space exists. Like the storage backend and built-in
 * themes, this is core infrastructure: every page is scoped to a space, and
 * create/edit/delete require a default space to exist. Seeded on every boot
 * (idempotent) so a freshly set-up instance is usable immediately after the
 * first admin is created via the `/setup` first-run route.
 */
export async function seedDefaultSpace() {
  const existing = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
  if (existing) return;
  const [created] = await db
    .insert(schema.spaces)
    .values({
      slug: DEFAULT_SPACE_SLUG,
      name: 'Default',
      defaultLocale: 'en',
      anonymousRead: true,
      kind: 'wiki',
    })
    .returning();
  if (!created) throw new Error('Seed failed: could not create default space');
}

/**
 * Ensure the raw and generated spaces exist alongside the default wiki space
 * (022). Both are seeded in every writing mode so a copilot → llm-wiki switch
 * is a zero-migration flip; permissions keep them admin-only until then.
 * Idempotent and never touches the existing default space's anonymous_read.
 */
export async function seedWritingModeSpaces() {
  await seedDefaultSpace();
  const extraSpaces = [
    { slug: 'raw', name: 'Raw', kind: 'raw' },
    { slug: 'generated', name: 'Generated', kind: 'generated' },
  ] as const;
  for (const space of extraSpaces) {
    const existing = await db.query.spaces.findFirst({
      where: eq(schema.spaces.slug, space.slug),
    });
    if (existing) continue;
    await db.insert(schema.spaces).values({
      slug: space.slug,
      name: space.name,
      defaultLocale: 'en',
      anonymousRead: false,
      kind: space.kind,
    });
  }
}

/**
 * Ensure the writing-mode settings singleton exists (022). Seeding the row at
 * boot lets the content-write barrier's `SELECT … FOR SHARE` lock it even on a
 * fresh database, so `beginPendingSwitch` drains in-flight writes instead of
 * inserting past them. Idempotent; `getMode` keeps its lazy seed as fallback.
 */
export async function seedWritingModeSettings() {
  await db
    .insert(schema.writingModeSettings)
    .values({ id: 'default' })
    .onConflictDoNothing();
}

export async function seedDatabase() {
  await seedDefaultStorageBackend();
  // Built-in system themes are core (read-only) data, seeded on every boot.
  await seedBuiltinSystemThemes();
  // The three writing-mode spaces are core infrastructure; seeded on every
  // boot so the instance is writable right after first-run setup.
  await seedWritingModeSpaces();
  await seedWritingModeSettings();

  // Demo/sample data only: a sample admin account and welcome page. This NEVER
  // runs in production unless explicitly opted in via NEXT_WIKI_SEED=true. The
  // first real admin is created interactively through the /setup first-run
  // route (see services/setup.ts); shipping a hard-coded admin would both
  // preempt that flow and expose a publicly-known credential.
  if (env.NODE_ENV === 'production' && env.NEXT_WIKI_SEED !== 'true') {
    return;
  }

  const space = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
  if (!space) throw new Error('Seed failed: default space missing');

  let admin = await db.query.users.findFirst({
    where: eq(schema.users.email, 'admin@example.com'),
  });

  if (!admin) {
    const [created] = await db
      .insert(schema.users)
      .values({
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'admin',
        status: 'active',
        displayName: 'Admin',
      })
      .returning();
    if (!created) throw new Error('Seed failed: could not create admin user');
    admin = created;
  }

  const existingPage = await db.query.pages.findFirst({
    where: eq(schema.pages.slug, 'welcome'),
  });

  if (existingPage) {
    return;
  }

  // Create the system default welcome page on first install. This page is
  // shipped with next-wiki and demonstrates the supported Markdown extensions.
  // The content is shared with the first-run onboarding sample-page writer.
  const source = WELCOME_PAGE_SOURCE;

  const { html, hash } = renderMarkdown(source);

  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: space.id,
      slug: 'welcome',
      path: 'welcome',
      title: 'Welcome to next-wiki',
      authorId: admin.id,
    })
    .returning();

  if (!page) throw new Error('Seed failed: could not create sample page');

  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page.id,
      versionNumber: 1,
      contentType: 'text/markdown',
      contentSource: source,
      contentHtml: html,
      contentHash: hash,
      authorId: admin.id,
      status: 'published',
      publishedAt: new Date(),
    })
    .returning();

  if (!revision) throw new Error('Seed failed: could not create sample revision');

  await db
    .update(schema.pages)
    .set({
      currentPublishedVersionId: revision.id,
      latestVersionId: revision.id,
    })
    .where(eq(schema.pages.id, page.id));
}
