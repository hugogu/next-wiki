import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  normalizePortableManifest,
  portablePageFrontmatterSchema,
  type NormalizedPortableManifest,
  type PortablePageFrontmatter,
} from '@next-wiki/shared';

export type { PortablePageFrontmatter };

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export type PortablePageSpaceKind = 'wiki' | 'generated' | 'raw';

/**
 * Build a portable page entry path. The unscoped form is the legacy v1/v2
 * layout; v2 exports pass the space kind so pages with the same path in
 * different spaces cannot collide inside one ZIP.
 */
export function pageEntryPath(
  locale: string,
  canonicalPath: string,
  spaceKind?: PortablePageSpaceKind,
): string {
  const cleanLocale = locale.normalize('NFC').replace(/[^A-Za-z0-9_-]/g, '_');
  const cleanPath = canonicalPath
    .normalize('NFC')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const scope = spaceKind ? `${spaceKind}/` : '';
  return `pages/${scope}${cleanLocale}/${cleanPath || '_root'}.md`;
}

export function pageHistoryEntryPath(
  locale: string,
  canonicalPath: string,
  versionNumber: number,
  spaceKind?: PortablePageSpaceKind,
): string {
  const cleanLocale = locale.normalize('NFC').replace(/[^A-Za-z0-9_-]/g, '_');
  const cleanPath = canonicalPath
    .normalize('NFC')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const scope = spaceKind ? `${spaceKind}/` : '';
  return `pages/${scope}${cleanLocale}/${cleanPath || '_root'}/history/${versionNumber}.md`;
}

export function serializePage(fm: PortablePageFrontmatter, markdown: string): string {
  const yaml = stringifyYaml(fm, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${markdown}`;
}

export function parsePage(value: string): { frontmatter: PortablePageFrontmatter; markdown: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/.exec(value);
  if (!match) throw new Error('Portable page is missing YAML frontmatter');
  const raw = parseYaml(match[1]!) as Record<string, unknown>;
  // Accept both v1 and v2 frontmatter; lift v1 to v2 shape so the import pipeline
  // uses a single type.
  if (raw.nextWikiArchiveVersion === 1) {
    return {
      frontmatter: {
        nextWikiArchiveVersion: 2,
        sourcePageId: String(raw.sourcePageId ?? ''),
        sourceRevisionId: String(raw.sourceRevisionId ?? ''),
        spaceKind: 'wiki',
        spaceSlug: 'default',
        path: String(raw.path ?? ''),
        locale: String(raw.locale ?? ''),
        title: String(raw.title ?? ''),
        contentType: String(raw.contentType ?? 'text/markdown'),
        contentHash: String(raw.contentHash ?? ''),
        publishedAt: raw.publishedAt === null ? null : String(raw.publishedAt ?? ''),
        createdAt: String(raw.createdAt ?? ''),
        updatedAt: String(raw.updatedAt ?? ''),
        inputKind: null,
        rawSource: null,
      },
      markdown: match[2] ?? '',
    };
  }
  // Already v2 — validate with shared schema.
  const frontmatter = portablePageFrontmatterSchema.parse(raw);
  return { frontmatter, markdown: match[2] ?? '' };
}

export function validateManifest(input: unknown): NormalizedPortableManifest {
  return normalizePortableManifest(input);
}

export function stableManifest(manifest: NormalizedPortableManifest): NormalizedPortableManifest {
  return {
    ...manifest,
    pages: [...manifest.pages].sort(
      (left, right) =>
        left.spaceKind.localeCompare(right.spaceKind) ||
        left.spaceSlug.localeCompare(right.spaceSlug) ||
        left.locale.localeCompare(right.locale) ||
        left.path.localeCompare(right.path) ||
        left.contentHash.localeCompare(right.contentHash) ||
        left.entry.localeCompare(right.entry),
    ),
    assets: [...manifest.assets].sort((left, right) => left.id.localeCompare(right.id)),
    files: [...manifest.files].sort((left, right) => left.entry.localeCompare(right.entry)),
  };
}
