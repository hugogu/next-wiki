import { ZipFile } from 'yazl';
import type { ExportAsset, ExportPage } from '@/server/services/transfer-export';
import { ensureOkfConceptPath, ensureOkfConformance } from '@/server/services/okf';
import {
  transferArtifactStore,
  type StoredArtifact,
  type TransferArtifactStore,
} from './artifact-store';
import { pageEntryPath } from './manifest';
import { portableAssetReference, rewriteMarkdownImages } from './markdown-links';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const FRONTMATTER_PATTERN = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/;

function rewriteMarkdownBody(source: string, replacer: (url: string) => string | null): string {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) throw new Error('Generated concept is missing YAML frontmatter');
  return `${match[1]}${rewriteMarkdownImages(match[2] ?? '', replacer)}`;
}

function validatePage(page: ExportPage, capturedAt: string): void {
  ensureOkfConceptPath(page.path);
  const conformed = ensureOkfConformance(page.markdown, {
    title: page.title,
    now: new Date(capturedAt),
  });
  if (conformed !== page.markdown) {
    throw new Error('Generated concept is missing YAML frontmatter');
  }
}

/** Write an OKF bundle without the portable archive's transport frontmatter. */
export async function writeOkfArchive(input: {
  storageKey: string;
  capturedAt: string;
  pages: ExportPage[];
  assets: ExportAsset[];
  store?: TransferArtifactStore;
}): Promise<{ stored: StoredArtifact }> {
  const zip = new ZipFile();
  const target = await (input.store ?? transferArtifactStore).createWriteStream(input.storageKey);
  zip.outputStream.pipe(target.stream);

  const assetsBySourceId = new Map<string, { entry: string }>();
  const assetEntries = new Map<string, ExportAsset>();
  const sortedAssets = [...input.assets].sort((left, right) => left.id.localeCompare(right.id));
  for (const asset of sortedAssets) {
    const extension = EXTENSION_BY_TYPE[asset.contentType] ?? 'bin';
    const entry = `assets/${asset.contentHash}.${extension}`;
    assetsBySourceId.set(asset.id, { entry });
    assetEntries.set(entry, asset);
  }

  for (const page of [...input.pages].sort((left, right) => left.locale.localeCompare(right.locale) || left.path.localeCompare(right.path))) {
    validatePage(page, input.capturedAt);
    const entry = pageEntryPath(page.locale, page.path);
    const markdown = rewriteMarkdownBody(page.markdown, (url) => {
      const id = /^\/api\/assets\/([0-9a-f-]{36})(?:[?#].*)?$/i.exec(url)?.[1];
      const asset = id ? assetsBySourceId.get(id) : undefined;
      return asset ? portableAssetReference(entry, asset.entry) : null;
    });
    zip.addBuffer(Buffer.from(markdown), entry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
  }

  for (const [entry, asset] of [...assetEntries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    zip.addBuffer(asset.bytes, entry, { mtime: new Date(input.capturedAt), mode: 0o100644 });
  }

  const report = JSON.stringify({
    format: 'okf',
    exportedPages: input.pages.length,
    exportedAssets: input.assets.length,
  }, null, 2);
  zip.addBuffer(Buffer.from(report), 'reports/export.json', { mtime: new Date(input.capturedAt), mode: 0o100644 });
  zip.end();
  return { stored: await target.complete() };
}
