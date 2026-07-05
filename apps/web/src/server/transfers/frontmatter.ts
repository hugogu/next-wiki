import { parse as parseYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

/**
 * Parses the optional leading `---` YAML frontmatter block from page Markdown.
 * Unlike the portable-archive `parsePage`, this tolerates any shape (or none)
 * of YAML and never throws — malformed frontmatter is treated as absent so a
 * single bad page can't break search/list/read responses.
 */
export function parsePageFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown> | null;
  markdown: string;
} {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) {
    return { frontmatter: null, markdown };
  }

  const body = match[2] ?? '';
  try {
    const parsed: unknown = parseYaml(match[1]!);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { frontmatter: null, markdown: body };
    }
    return { frontmatter: parsed as Record<string, unknown>, markdown: body };
  } catch (error) {
    console.warn('Failed to parse page frontmatter as YAML', error);
    return { frontmatter: null, markdown: body };
  }
}
