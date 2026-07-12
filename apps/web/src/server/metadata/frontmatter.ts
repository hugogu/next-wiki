import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DomainError } from '@/server/errors';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

export type SupportedMetadata = {
  title?: string;
  date?: string | null;
  tags?: string[] | null;
  summary?: string | null;
};

export type ParsedFrontmatter = {
  frontmatter: Record<string, unknown> | null;
  body: string;
  hasValidFrontmatter: boolean;
};

export function normalizeTagName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) return { frontmatter: null, body: source, hasValidFrontmatter: false };
  try {
    const value: unknown = parseYaml(match[1]!);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { frontmatter: null, body: source, hasValidFrontmatter: false };
    }
    return { frontmatter: value as Record<string, unknown>, body: match[2] ?? '', hasValidFrontmatter: true };
  } catch {
    return { frontmatter: null, body: source, hasValidFrontmatter: false };
  }
}

function validateDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = match ? new Date(`${value}T00:00:00Z`) : null;
  if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) {
    throw new DomainError('BAD_REQUEST', 'Date must be a valid YYYY-MM-DD calendar date');
  }
  return value;
}

function validateTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
    throw new DomainError('BAD_REQUEST', 'Tags must be an array of text values');
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value) {
    const name = raw.trim();
    const normalized = normalizeTagName(name);
    if (!name || !normalized) throw new DomainError('BAD_REQUEST', 'Tags cannot be empty');
    if (seen.has(normalized)) throw new DomainError('BAD_REQUEST', 'Tags must be unique');
    seen.add(normalized);
    tags.push(name);
  }
  return tags;
}

export function supportedMetadataFromFrontmatter(frontmatter: Record<string, unknown> | null): SupportedMetadata {
  if (!frontmatter) return {};
  const metadata: SupportedMetadata = {};
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) metadata.title = frontmatter.title.trim();
  if (typeof frontmatter.date === 'string') metadata.date = validateDate(frontmatter.date);
  if (frontmatter.tags !== undefined) metadata.tags = validateTags(frontmatter.tags);
  if (typeof frontmatter.summary === 'string' && frontmatter.summary.trim()) metadata.summary = frontmatter.summary.trim();
  return metadata;
}

export function mergeSupportedMetadata(
  source: string,
  patch: SupportedMetadata,
  fallbackTitle: string,
): { source: string; metadata: Required<Pick<SupportedMetadata, 'title' | 'tags'>> & SupportedMetadata } {
  const parsed = parseFrontmatter(source);
  const merged: Record<string, unknown> = { ...(parsed.frontmatter ?? {}) };
  const current = supportedMetadataFromFrontmatter(parsed.frontmatter);
  const title = patch.title === undefined ? (current.title ?? fallbackTitle) : patch.title.trim();
  if (!title) throw new DomainError('BAD_REQUEST', 'Title cannot be empty');
  const date = patch.date === undefined ? current.date : patch.date;
  const summary = patch.summary === undefined ? current.summary : patch.summary;
  const tags = patch.tags === undefined ? (current.tags ?? []) : patch.tags === null ? [] : validateTags(patch.tags);
  merged.title = title;
  if (date === null || date === undefined) delete merged.date;
  else merged.date = validateDate(date);
  if (summary === null || summary === undefined || !summary.trim()) delete merged.summary;
  else merged.summary = summary.trim();
  merged.tags = tags;
  const serialized = `---\n${stringifyYaml(merged, { lineWidth: 0 }).trimEnd()}\n---\n\n${parsed.body}`;
  return { source: serialized, metadata: { title, date: date ?? null, summary: summary?.trim() || null, tags } };
}

export function markdownBody(source: string): string {
  const parsed = parseFrontmatter(source);
  return parsed.hasValidFrontmatter ? parsed.body : source;
}
