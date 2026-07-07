import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { fetchRemote } from '@/server/transfers/remote-fetch';
import { stripLocalePrefix } from '@/server/transfers/markdown-links';
import { writeImportedAsset } from './transfer-asset-writer';

export function resolveWikiJsImageUrl(input: {
  baseUrl: string;
  pagePath: string;
  imageUrl: string;
}): { url: URL; sameOrigin: boolean } {
  const baseUrlOrigin = new URL(input.baseUrl).origin;
  // Wiki.js emits locale routing prefixes (`/zh/`, `/en-US/`) on page paths and
  // image URLs. next-wiki stores locale as page metadata, so the segment is
  // stripped before URL resolution. Cross-origin absolute image URLs are left
  // untouched — the same letters may be a real path segment on another host.
  const pagePath = stripLocalePrefix(input.pagePath);
  const isAbsoluteImageUrl = /^https?:\/\//i.test(input.imageUrl);
  const imageUrl =
    !isAbsoluteImageUrl || new URL(input.imageUrl).origin === baseUrlOrigin
      ? stripLocalePrefix(input.imageUrl)
      : input.imageUrl;
  const pageUrl = new URL(pagePath.replace(/^\/+/, ''), `${input.baseUrl.replace(/\/$/, '')}/`);
  const resolved = new URL(imageUrl, pageUrl);
  const sameOrigin = resolved.origin === new URL(input.baseUrl).origin;
  return { url: resolved, sameOrigin };
}

export async function localizeWikiJsImage(input: {
  sourceId: string;
  baseUrl: string;
  apiToken: string;
  allowPrivateNetwork: boolean;
  pagePath: string;
  imageUrl: string;
  actorUserId: string | null;
  runId: string;
}): Promise<string> {
  const { url: resolved, sameOrigin } = resolveWikiJsImageUrl(input);
  const sourceKey = resolved.toString();
  const mapping = await db.query.transferAssetMappings.findFirst({
    where: and(
      eq(schema.transferAssetMappings.sourceType, 'wikijs'),
      eq(schema.transferAssetMappings.sourceIdentity, input.sourceId),
      eq(schema.transferAssetMappings.sourceAssetKey, sourceKey),
    ),
  });
  if (mapping) return `/api/assets/${mapping.targetAssetId}`;
  const response = await fetchRemote({
    url: resolved,
    headers: sameOrigin ? { Authorization: `Bearer ${input.apiToken}` } : undefined,
    allowedPrivateOrigin:
      sameOrigin && input.allowPrivateNetwork ? new URL(input.baseUrl).origin : undefined,
  });
  const asset = await writeImportedAsset({
    bytes: response.bytes,
    contentType: response.contentType,
    actorUserId: input.actorUserId,
  });
  await db.insert(schema.transferAssetMappings).values({
    sourceType: 'wikijs',
    sourceIdentity: input.sourceId,
    sourceAssetKey: sourceKey,
    sourceFingerprint: asset.contentHash,
    targetAssetId: asset.id,
    lastRunId: input.runId,
  }).onConflictDoUpdate({
    target: [
      schema.transferAssetMappings.sourceType,
      schema.transferAssetMappings.sourceIdentity,
      schema.transferAssetMappings.sourceAssetKey,
    ],
    set: {
      sourceFingerprint: asset.contentHash,
      targetAssetId: asset.id,
      lastRunId: input.runId,
      updatedAt: new Date(),
    },
  });
  return `/api/assets/${asset.id}`;
}
