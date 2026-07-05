import { parse as parseYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

export type FrontmatterFilters = {
  tag?: string[];
  status?: string[];
  owner?: string[];
  hasFrontmatter?: boolean;
};

function frontmatterFieldMatches(value: unknown, filterValues: string[]): boolean {
  if (value === undefined || value === null) return false;
  const values = Array.isArray(value) ? value : [value];
  return values.some((entry) => filterValues.includes(String(entry)));
}

/** OR within a filter key (`filters.tag`), AND across keys — shared by keyword
 * search/list (public-content.ts) and semantic search (ai-retrieval.ts) so the
 * two endpoints stay consistent per FR-009/FR-013. */
export function matchesFrontmatterFilters(frontmatter: Record<string, unknown> | null, filters: FrontmatterFilters): boolean {
  if (filters.hasFrontmatter !== undefined && (frontmatter !== null) !== filters.hasFrontmatter) {
    return false;
  }
  if (filters.tag && !frontmatterFieldMatches(frontmatter?.tags, filters.tag)) return false;
  if (filters.status && !frontmatterFieldMatches(frontmatter?.status, filters.status)) return false;
  if (filters.owner && !frontmatterFieldMatches(frontmatter?.owner, filters.owner)) return false;
  return true;
}

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
