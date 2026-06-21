import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  portableArchiveManifestSchema,
  type PortableArchiveManifest,
} from '@next-wiki/shared';

export type PageFrontmatter = {
  nextWikiArchiveVersion: 1;
  sourcePageId: string;
  sourceRevisionId: string;
  path: string;
  locale: string;
  title: string;
  contentType: 'text/markdown';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function pageEntryPath(locale: string, canonicalPath: string): string {
  const cleanLocale = locale.normalize('NFC').replace(/[^A-Za-z0-9_-]/g, '_');
  const cleanPath = canonicalPath
    .normalize('NFC')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `pages/${cleanLocale}/${cleanPath || '_root'}.md`;
}

export function serializePage(frontmatter: PageFrontmatter, markdown: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${markdown}`;
}

export function parsePage(value: string): { frontmatter: PageFrontmatter; markdown: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/.exec(value);
  if (!match) throw new Error('Portable page is missing YAML frontmatter');
  const frontmatter = parseYaml(match[1]!) as PageFrontmatter;
  if (frontmatter.nextWikiArchiveVersion !== 1) {
    throw new Error('Unsupported portable page version');
  }
  return { frontmatter, markdown: match[2] ?? '' };
}

export function validateManifest(input: unknown): PortableArchiveManifest {
  return portableArchiveManifestSchema.parse(input);
}

export function stableManifest(manifest: PortableArchiveManifest): PortableArchiveManifest {
  return {
    ...manifest,
    pages: [...manifest.pages].sort(
      (left, right) =>
        left.locale.localeCompare(right.locale) ||
        left.path.localeCompare(right.path) ||
        left.contentHash.localeCompare(right.contentHash),
    ),
    assets: [...manifest.assets].sort((left, right) => left.id.localeCompare(right.id)),
    files: [...manifest.files].sort((left, right) => left.entry.localeCompare(right.entry)),
  };
}
