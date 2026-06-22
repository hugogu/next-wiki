import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  readImageWithFallback,
  readMarkdownWithFallback,
} from '@/server/content-store/read-router';
import type { GitBackendConfig } from '@next-wiki/shared';

const ASSET_URL_PATTERN = /\/api\/assets\/([0-9a-f-]{36})/gi;

function quoteFrontmatter(value: string): string {
  return JSON.stringify(value);
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '';
  }
}

function safeOutputPath(root: string, relativePath: string): string {
  const absoluteRoot = resolve(root);
  const output = resolve(absoluteRoot, relativePath);
  const prefix = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`;
  if (!output.startsWith(prefix)) throw new Error(`Unsafe Git export path: ${relativePath}`);
  return output;
}

export type GitExportSnapshot = {
  pages: number;
  assets: number;
};

/**
 * Materialize the current published snapshot. Callers use a fresh checkout, so
 * replacing its working tree automatically prunes deleted/renamed pages and
 * assets no longer referenced by published revisions.
 */
export async function materializeGitExport(
  root: string,
  config: Pick<GitBackendConfig, 'assetsDir'>,
): Promise<GitExportSnapshot> {
  const rows = await db
    .select({
      path: schema.pages.path,
      title: schema.pages.title,
      locale: schema.pages.locale,
      revisionId: schema.pageRevisions.id,
      version: schema.pageRevisions.versionNumber,
      contentSource: schema.pageRevisions.contentSource,
      contentHash: schema.pageRevisions.contentHash,
      publishedAt: schema.pageRevisions.publishedAt,
    })
    .from(schema.pages)
    .innerJoin(
      schema.pageRevisions,
      eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id),
    )
    .where(and(isNull(schema.pages.deletedAt), eq(schema.pageRevisions.status, 'published')))
    .orderBy(schema.pages.path);

  const revisionIds = rows.map((row) => row.revisionId);
  const refs =
    revisionIds.length === 0
      ? []
      : await db
          .select({
            revisionId: schema.contentAssetRefs.revisionId,
            assetId: schema.contentAssets.id,
            contentType: schema.contentAssets.contentType,
            contentHash: schema.contentAssets.contentHash,
          })
          .from(schema.contentAssetRefs)
          .innerJoin(
            schema.contentAssets,
            eq(schema.contentAssetRefs.assetId, schema.contentAssets.id),
          )
          .where(
            and(
              inArray(schema.contentAssetRefs.revisionId, revisionIds),
              isNull(schema.contentAssets.deletedAt),
            ),
          );

  const assetInfo = new Map(
    refs.map((ref) => [
      ref.assetId,
      { contentType: ref.contentType, contentHash: ref.contentHash },
    ]),
  );
  await mkdir(root, { recursive: true });

  for (const row of rows) {
    const source = await readMarkdownWithFallback({
      id: row.revisionId,
      contentSource: row.contentSource,
      contentHash: row.contentHash,
    });
    const rewritten = source.replace(ASSET_URL_PATTERN, (_match, assetId: string) => {
      const asset = assetInfo.get(assetId);
      if (!asset) return _match;
      const extension = extensionFor(asset.contentType);
      const pageDepth = row.path.split('/').length - 1;
      const relativePrefix = pageDepth === 0 ? './' : '../'.repeat(pageDepth);
      return `${relativePrefix}${config.assetsDir}/${assetId}${extension}`;
    });
    const frontmatter = [
      '---',
      `title: ${quoteFrontmatter(row.title)}`,
      `path: ${quoteFrontmatter(row.path)}`,
      `locale: ${quoteFrontmatter(row.locale)}`,
      `version: ${row.version}`,
      `publishedAt: ${quoteFrontmatter(row.publishedAt?.toISOString() ?? '')}`,
      '---',
      '',
    ].join('\n');
    const output = safeOutputPath(root, `${row.path}.md`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${frontmatter}${rewritten}\n`, 'utf8');
  }

  for (const [assetId, asset] of assetInfo) {
    const { bytes } = await readImageWithFallback({
      id: assetId,
      contentHash: asset.contentHash,
    });
    const output = safeOutputPath(
      root,
      join(config.assetsDir, `${assetId}${extensionFor(asset.contentType)}`),
    );
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }

  return { pages: rows.length, assets: assetInfo.size };
}
