import { ZipFile } from 'yazl';
import type { NormalizedPortableManifest } from '@next-wiki/shared';
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
  type PortablePageFrontmatter,
} from './manifest';
import {
  portableAssetReference,
  rewriteMarkdownImages,
} from './markdown-links';
import { getMode as getWritingMode } from '@/server/services/writing-mode';

function extensionForType(contentType: string): string {
  const known: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
  };
  if (known[contentType]) return known[contentType]!;
  const sub = contentType.split('/')[1];
  if (sub) {
    // Keep it safe: collapse common sub-types, avoid dots or slashes.
    return sub.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32) || 'bin';
  }
  return 'bin';
}

export async function writePortableArchive(input: {
  storageKey: string;
  instanceId: string;
  productVersion: string;
  capturedAt: string;
  pages: ExportPage[];
  assets: ExportAsset[];
  store?: TransferArtifactStore;
}): Promise<{ stored: StoredArtifact; manifest: NormalizedPortableManifest }> {
  const zip = new ZipFile();
  const target = await (input.store ?? transferArtifactStore).createWriteStream(input.storageKey);
  zip.outputStream.pipe(target.stream);

  const assetsBySourceId = new Map<string, { hash: string; entry: string }>();
  const manifestAssets = input.assets.map((asset) => {
    const hash = sha256(asset.bytes);
    const ext = extensionForType(asset.contentType);
    const entry = `assets/${hash}.${ext}`;
    assetsBySourceId.set(asset.id, { hash, entry });
    return {
      id: hash,
      entry,
      contentHash: hash,
      contentType: asset.contentType,
      sizeBytes: asset.bytes.length,
      sourceAssetId: asset.id,
    };
  });

  const files: NormalizedPortableManifest['files'] = [];
  const manifestPages = input.pages.map((page) => {
    const entry = pageEntryPath(page.locale, page.path);
    const bodyText = page.spaceKind === 'raw'
      ? page.markdown
      : rewriteMarkdownImages(page.markdown, (url) => {
          const id = /^\/api\/assets\/([0-9a-f-]{36})(?:[?#].*)?$/i.exec(url)?.[1];
          const asset = id ? assetsBySourceId.get(id) : undefined;
          return asset ? portableAssetReference(entry, asset.entry) : null;
        });
    const frontmatter: PortablePageFrontmatter = {
      nextWikiArchiveVersion: 2,
      sourcePageId: page.id,
      sourceRevisionId: page.revisionId,
      spaceKind: page.spaceKind,
      spaceSlug: page.spaceSlug,
      path: page.path,
      locale: page.locale,
      title: page.title,
      contentType: page.markdownContentType,
      contentHash: page.contentHash,
      publishedAt: page.publishedAt,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      inputKind: page.inputKind ?? null,
      rawSource: page.rawSource ?? null,
    };
    const body = serializePage(frontmatter, bodyText);
    zip.addBuffer(Buffer.from(body), entry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
    files.push({ entry, sha256: sha256(body), sizeBytes: Buffer.byteLength(body) });
    return {
      id: page.id,
      entry,
      spaceKind: page.spaceKind,
      spaceSlug: page.spaceSlug,
      path: page.path,
      locale: page.locale,
      title: page.title,
      contentType: page.markdownContentType,
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
    zip.addBuffer(asset.bytes, descriptor.entry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
    files.push({ entry: descriptor.entry, sha256: descriptor.contentHash, sizeBytes: descriptor.sizeBytes });
  }

  const writingMode = (await getWritingMode()) ?? 'copilot';
  const spacesSummary: NormalizedPortableManifest['snapshot']['spaces'] = [];
  const kindCounts = new Map<string, number>();
  for (const page of manifestPages) {
    const slug = page.spaceSlug;
    kindCounts.set(slug, (kindCounts.get(slug) ?? 0) + 1);
  }
  const seenKinds = new Set(manifestPages.map((p) => p.spaceKind));
  for (const kind of seenKinds) {
    const slug = kind === 'wiki' ? input.instanceId : kind;
    spacesSummary.push({ slug, kind, pageCount: kindCounts.get(slug) ?? 0 });
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
    version: 2,
    createdAt: new Date().toISOString(),
    source: { instanceId: input.instanceId, product: 'next-wiki', version: input.productVersion, writingMode },
    snapshot: { capturedAt: input.capturedAt, spaces: spacesSummary },
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
