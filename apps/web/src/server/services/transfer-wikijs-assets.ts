import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { fetchRemote } from '@/server/transfers/remote-fetch';
import { writeImportedAsset } from './transfer-asset-writer';

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
  const pageUrl = new URL(input.pagePath.replace(/^\/+/, ''), `${input.baseUrl.replace(/\/$/, '')}/`);
  const resolved = new URL(input.imageUrl, pageUrl);
  const sourceKey = resolved.toString();
  const mapping = await db.query.transferAssetMappings.findFirst({
    where: and(
      eq(schema.transferAssetMappings.sourceType, 'wikijs'),
      eq(schema.transferAssetMappings.sourceIdentity, input.sourceId),
      eq(schema.transferAssetMappings.sourceAssetKey, sourceKey),
    ),
  });
  if (mapping) return `/api/assets/${mapping.targetAssetId}`;
  const sameOrigin = resolved.origin === new URL(input.baseUrl).origin;
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
