import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { env } from '@/server/config';

const DEFAULT_SPACE_SLUG = 'default';

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

export async function seedDatabase() {
  await seedDefaultStorageBackend();

  if (env.NODE_ENV === 'production' && env.NEXT_WIKI_SEED !== 'true') {
    return;
  }

  let space = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });

  if (!space) {
    const [created] = await db
      .insert(schema.spaces)
      .values({
        slug: DEFAULT_SPACE_SLUG,
        name: 'Default',
        defaultLocale: 'en',
        anonymousRead: true,
      })
      .returning();
    if (!created) throw new Error('Seed failed: could not create default space');
    space = created;
  }

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
  const source = `# Welcome to next-wiki

This is the first published page. Every page is authored in **Markdown** and rendered to HTML when saved so readers see fast, static-like pages.

## What you can do

| Feature | Editor | Reader | Admin |
| --- |:---:|:---:|:---:|
| Read published pages | ✓ | ✓ | ✓ |
| Draft and edit pages | ✓ | — | ✓ |
| Publish revisions | ✓ | — | ✓ |
| Manage users | — | — | ✓ |

## Markdown support

Pages support standard Markdown plus GitHub-flavored extras such as tables, task lists, fenced code blocks with syntax highlighting, LaTeX math, and Mermaid diagrams.

\`\`\`js
// A small example
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('next-wiki'));
\`\`\`

### Math

Inline math: $E = mc^2$

Block math:

$$
\\int_{0}^{\\infty} e^{-x} \\, dx = 1
$$

### Diagrams

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\`

## Try it out

- Click **New page** to create a draft.
- Use the split editor to write Markdown and preview the result side by side.
- Publish a revision when you are ready to share it.

> **Tip:** Code blocks use language tags like \`js\`, \`ts\`, \`json\`, \`sql\`, \`yaml\`, or \`mermaid\`. LaTeX is wrapped in \`$...$\` or \`$$...$$\`.
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
