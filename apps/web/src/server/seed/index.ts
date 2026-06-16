import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { env } from '@/server/config';

const DEFAULT_SPACE_SLUG = 'default';

export async function seedDatabase() {
  if (env.NODE_ENV === 'production' && env.NEXT_WIKI_SEED !== 'true') {
    return;
  }

  const existingSpace = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });

  if (existingSpace) {
    return;
  }

  // Create the default space.
  const [space] = await db
    .insert(schema.spaces)
    .values({
      slug: DEFAULT_SPACE_SLUG,
      name: 'Default',
      defaultLocale: 'en',
      anonymousRead: true,
    })
    .returning();

  if (!space) throw new Error('Seed failed: could not create default space');

  // Create a dev admin user for local development.
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'admin',
      status: 'active',
      displayName: 'Admin',
    })
    .returning();

  if (!admin) throw new Error('Seed failed: could not create admin user');

  // Create a sample published page for the MVP read slice.
  const source = `# Welcome to next-wiki

This is the first published page. Every page is authored in **Markdown** and
rendered to HTML when saved so readers see fast, static-like pages.

## Features

- RESTful URLs with working browser history
- Version-level drafts
- Three built-in roles: admin, editor, reader
`;

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
