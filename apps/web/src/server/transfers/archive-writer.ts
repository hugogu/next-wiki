import { ZipFile } from 'yazl';
import type { PortableArchiveManifest } from '@next-wiki/shared';
import type { ExportPage, ExportAsset } from '@/server/services/transfer-export';
import {
  transferArtifactStore,
  type StoredArtifact,
  type TransferArtifactStore,
} from './artifact-store';
import {
  pageEntryPath,
  serializePage,
  sha256,
  stableManifest,
  type PageFrontmatter,
} from './manifest';
import {
  portableAssetReference,
  rewriteMarkdownImages,
} from './markdown-links';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function writePortableArchive(input: {
  storageKey: string;
  instanceId: string;
  productVersion: string;
  spaceSlug: string;
  capturedAt: string;
  pages: ExportPage[];
  assets: ExportAsset[];
  store?: TransferArtifactStore;
}): Promise<{ stored: StoredArtifact; manifest: PortableArchiveManifest }> {
  const zip = new ZipFile();
  const target = await (input.store ?? transferArtifactStore).createWriteStream(input.storageKey);
  zip.outputStream.pipe(target.stream);

  const assetsBySourceId = new Map<string, { hash: string; entry: string }>();
  const manifestAssets = input.assets.map((asset) => {
    const hash = sha256(asset.bytes);
    const extension = EXTENSION_BY_TYPE[asset.contentType] ?? 'bin';
    const entry = `assets/${hash}.${extension}`;
    assetsBySourceId.set(asset.id, { hash, entry });
    return {
      id: hash,
      entry,
      contentHash: hash,
      contentType: asset.contentType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml',
      sizeBytes: asset.bytes.length,
      sourceAssetId: asset.id,
    };
  });

  const files: PortableArchiveManifest['files'] = [];
  const manifestPages = input.pages.map((page) => {
    const entry = pageEntryPath(page.locale, page.path);
    const rewritten = rewriteMarkdownImages(page.markdown, (url) => {
      const id = /^\/api\/assets\/([0-9a-f-]{36})(?:[?#].*)?$/i.exec(url)?.[1];
      const asset = id ? assetsBySourceId.get(id) : undefined;
      return asset ? portableAssetReference(entry, asset.entry) : null;
    });
    const frontmatter: PageFrontmatter = {
      nextWikiArchiveVersion: 1,
      sourcePageId: page.id,
      sourceRevisionId: page.revisionId,
      path: page.path,
      locale: page.locale,
      title: page.title,
      contentType: 'text/markdown',
      publishedAt: page.publishedAt,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
    const body = serializePage(frontmatter, rewritten);
    zip.addBuffer(Buffer.from(body), entry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
    files.push({ entry, sha256: sha256(body), sizeBytes: Buffer.byteLength(body) });
    return {
      id: page.id,
      entry,
      path: page.path,
      locale: page.locale,
      title: page.title,
      contentType: 'text/markdown' as const,
      contentHash: page.contentHash,
      sizeBytes: Buffer.byteLength(page.markdown),
      revisionId: page.revisionId,
      publishedAt: page.publishedAt,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      assetIds: page.assetIds.flatMap((id) => {
        const asset = assetsBySourceId.get(id);
        return asset ? [asset.hash] : [];
      }),
    };
  });

  for (const [index, asset] of input.assets.entries()) {
    const descriptor = manifestAssets[index]!;
    zip.addBuffer(asset.bytes, descriptor.entry, {
      mtime: new Date(input.capturedAt),
      mode: 0o100644,
    });
    files.push({
      entry: descriptor.entry,
      sha256: descriptor.contentHash,
      sizeBytes: descriptor.sizeBytes,
    });
  }
  const report = JSON.stringify({
    exportedPages: manifestPages.length,
    exportedAssets: manifestAssets.length,
  }, null, 2);
  const reportEntry = 'reports/export.json';
  zip.addBuffer(Buffer.from(report), reportEntry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
  files.push({ entry: reportEntry, sha256: sha256(report), sizeBytes: Buffer.byteLength(report) });

  const manifest = stableManifest({
    format: 'next-wiki-portable',
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      instanceId: input.instanceId,
      product: 'next-wiki',
      version: input.productVersion,
    },
    snapshot: { spaceSlug: input.spaceSlug, capturedAt: input.capturedAt },
    counts: { pages: manifestPages.length, assets: manifestAssets.length },
    pages: manifestPages,
    assets: manifestAssets,
    files,
  });
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json', {
    mtime: new Date(input.capturedAt),
    mode: 0o100644,
  });
  zip.end();
  const stored = await target.complete();
  return { stored, manifest };
}
