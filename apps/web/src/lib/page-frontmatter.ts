import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { publicDraftCreateInputSchema, type PublicDraftCreateInput } from '@next-wiki/shared';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

export type EditorMetadata = { date: string; summary: string; tags: string };
export type EditorMetadataBaseline = { title: string; metadata: EditorMetadata };

export function hasEditorFrontmatter(source: string): boolean {
  const match = FRONTMATTER.exec(source);
  if (!match) return false;
  try {
    const value: unknown = parseYaml(match[1]!);
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  } catch {
    return false;
  }
}

export function readEditorMetadata(source: string): EditorMetadata {
  const match = FRONTMATTER.exec(source);
  if (!match) return { date: '', summary: '', tags: '' };
  try {
    const value: unknown = parseYaml(match[1]!);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { date: '', summary: '', tags: '' };
    const frontmatter = value as Record<string, unknown>;
    return {
      date: typeof frontmatter.date === 'string' ? frontmatter.date : '',
      summary: typeof frontmatter.summary === 'string' ? frontmatter.summary : '',
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((tag): tag is string => typeof tag === 'string').join(', ') : '',
    };
  } catch {
    return { date: '', summary: '', tags: '' };
  }
}

export function writeEditorMetadata(
  source: string,
  title: string,
  metadata: EditorMetadata,
  baseline: EditorMetadataBaseline,
  options: { forceFrontmatter?: boolean } = {},
): string {
  const titleChanged = title !== baseline.title;
  const dateChanged = metadata.date !== baseline.metadata.date;
  const summaryChanged = metadata.summary !== baseline.metadata.summary;
  const tagsChanged = metadata.tags !== baseline.metadata.tags;
  if (!titleChanged && !dateChanged && !summaryChanged && !tagsChanged && !options.forceFrontmatter) return source;

  const match = FRONTMATTER.exec(source);
  let frontmatter: Record<string, unknown> = {};
  let body = source;
  if (match) {
    try {
      const value: unknown = parseYaml(match[1]!);
      if (value && typeof value === 'object' && !Array.isArray(value)) frontmatter = { ...(value as Record<string, unknown>) };
      body = match[2] ?? '';
    } catch {
      return source;
    }
  }
  // A newly-created frontmatter block needs the canonical title. Existing
  // frontmatter keeps the user's current raw value unless the title control
  // was explicitly changed.
  if (!match || titleChanged || options.forceFrontmatter) frontmatter.title = title;
  if (dateChanged || options.forceFrontmatter) {
    if (metadata.date.trim()) frontmatter.date = metadata.date.trim(); else delete frontmatter.date;
  }
  if (summaryChanged || options.forceFrontmatter) {
    if (metadata.summary.trim()) frontmatter.summary = metadata.summary.trim(); else delete frontmatter.summary;
  }
  if (tagsChanged || options.forceFrontmatter) {
    frontmatter.tags = metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`;
}

/**
 * Build a draft-create payload from the properties-dialog inputs. Single source
 * of truth shared by the split editor and the admin properties dialog so the
 * two behave identically: when `writeMetadataToFrontmatter` is on, metadata is
 * embedded into the Markdown body; otherwise it is sent as structured metadata.
 */
export function buildDraftBody(args: {
  title: string;
  contentSource: string;
  metadata: EditorMetadata;
  baseline: EditorMetadataBaseline;
  writeMetadataToFrontmatter: boolean;
  baseRevisionId?: string;
}): PublicDraftCreateInput {
  const contentSource = args.writeMetadataToFrontmatter
    ? writeEditorMetadata(args.contentSource, args.title, args.metadata, args.baseline, {
        forceFrontmatter: !hasEditorFrontmatter(args.contentSource),
      })
    : args.contentSource;
  return publicDraftCreateInputSchema.parse({
    title: args.title,
    contentSource,
    metadata: args.writeMetadataToFrontmatter
      ? undefined
      : {
          date: args.metadata.date.trim() || null,
          summary: args.metadata.summary.trim() || null,
          tags: args.metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        },
    writeMetadataToFrontmatter: args.writeMetadataToFrontmatter,
    baseRevisionId: args.baseRevisionId,
  });
}
