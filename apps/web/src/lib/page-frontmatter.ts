import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

export type EditorMetadata = { date: string; summary: string; tags: string };

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

export function writeEditorMetadata(source: string, title: string, metadata: EditorMetadata): string {
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
  frontmatter.title = title;
  if (metadata.date.trim()) frontmatter.date = metadata.date.trim(); else delete frontmatter.date;
  if (metadata.summary.trim()) frontmatter.summary = metadata.summary.trim(); else delete frontmatter.summary;
  const tags = metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  frontmatter.tags = tags;
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`;
}
