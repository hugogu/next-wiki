import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { mergeSupportedMetadata, normalizeTagName, supportedMetadataFromFrontmatter, parseFrontmatter, type SupportedMetadata } from '@/server/metadata/frontmatter';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolvedPageMetadata = {
  title: string;
  date: string | null;
  summary: string | null;
  tags: string[];
};

export function metadataFromSource(source: string, fallbackTitle: string): ResolvedPageMetadata {
  const parsed = parseFrontmatter(source);
  const supported = supportedMetadataFromFrontmatter(parsed.frontmatter);
  return {
    title: supported.title ?? fallbackTitle,
    date: supported.date ?? null,
    summary: supported.summary ?? null,
    tags: supported.tags ?? [],
  };
}

async function resolveTag(tx: Transaction, spaceId: string, name: string) {
  const normalizedName = normalizeTagName(name);
  let tag = await tx.query.tags.findFirst({
    where: and(eq(schema.tags.spaceId, spaceId), eq(schema.tags.normalizedName, normalizedName), isNull(schema.tags.deletedAt)),
  });
  if (!tag) {
    await tx
      .insert(schema.tags)
      .values({ spaceId, name: name.trim(), normalizedName })
      .onConflictDoNothing();
    tag = await tx.query.tags.findFirst({
      where: and(eq(schema.tags.spaceId, spaceId), eq(schema.tags.normalizedName, normalizedName), isNull(schema.tags.deletedAt)),
    });
  }
  if (!tag) throw new Error('Failed to resolve tag');
  return tag;
}

/** Persist the typed projection belonging to an immutable revision. Call in the
 * same transaction that creates the revision so source, HTML, and metadata
 * cannot diverge. */
export async function persistRevisionMetadata(
  tx: Transaction,
  args: { revisionId: string; spaceId: string; source: string; fallbackTitle: string },
): Promise<ResolvedPageMetadata> {
  const metadata = metadataFromSource(args.source, args.fallbackTitle);
  await tx.insert(schema.pageRevisionMetadata).values({
    revisionId: args.revisionId,
    title: metadata.title,
    date: metadata.date,
    summary: metadata.summary,
  });
  for (const name of metadata.tags) {
    const tag = await resolveTag(tx, args.spaceId, name);
    await tx.insert(schema.pageRevisionTags).values({
      revisionId: args.revisionId,
      tagId: tag.id,
      tagName: tag.name,
      normalizedName: tag.normalizedName,
    });
  }
  return metadata;
}

export async function getRevisionMetadata(revisionId: string) {
  const metadata = await db.query.pageRevisionMetadata.findFirst({
    where: eq(schema.pageRevisionMetadata.revisionId, revisionId),
  });
  const tags = await db
    .select({ id: schema.tags.id, name: schema.pageRevisionTags.tagName, normalizedName: schema.pageRevisionTags.normalizedName })
    .from(schema.pageRevisionTags)
    .innerJoin(schema.tags, eq(schema.pageRevisionTags.tagId, schema.tags.id))
    .where(eq(schema.pageRevisionTags.revisionId, revisionId));
  return {
    date: metadata?.date ?? null,
    summary: metadata?.summary ?? null,
    tags,
  };
}

export function patchMetadata(source: string, patch: SupportedMetadata, fallbackTitle: string) {
  return mergeSupportedMetadata(source, patch, fallbackTitle);
}
