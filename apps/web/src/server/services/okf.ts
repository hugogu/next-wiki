import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DomainError } from '@/server/errors';

// Captures the frontmatter block (group 1) and the body after it (group 2).
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function ensureOkfConceptPath(path: string): void {
  const leaf = path.normalize('NFC').split('/').at(-1)?.toLowerCase();
  if (leaf === 'index' || leaf === 'log') {
    throw new DomainError('OKF_RESERVED_PATH', `Generated concept paths cannot end in '${leaf}'`);
  }
}

/**
 * Derive an OKF `type` from a page path so bulk moves/imports never fail for the
 * want of an explicit type: the parent directory path classifies a page in a
 * sub-folder (e.g. `docs/api/foo` → `docs/api`); a top-level page uses its own
 * slug. Used as the `fallbackType` when adapting content into the generated
 * space.
 */
export function deriveOkfTypeFromPath(path: string): string {
  const segments = path.normalize('NFC').split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length >= 2) return segments.slice(0, -1).join('/');
  return segments[0] ?? 'Note';
}

/**
 * Ensure Markdown is OKF-conformant for the generated space.
 *
 * - No frontmatter: inject a block with `type` (the `fallbackType`, else `Note`).
 * - Frontmatter present with a non-empty `type`: unchanged.
 * - Frontmatter present without a valid `type`: when `fallbackType` is provided
 *   (moves/imports), set it while preserving the other keys and the body;
 *   otherwise (direct authoring) reject with `OKF_TYPE_REQUIRED`.
 * - Unparseable/invalid frontmatter: rejected.
 */
export function ensureOkfConformance(
  source: string,
  input: { title: string; now: Date; fallbackType?: string },
): string {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) {
    if (source.startsWith('---\n') || source.startsWith('---\r\n')) {
      throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content has invalid YAML frontmatter');
    }
    const frontmatter = stringifyYaml({
      type: input.fallbackType?.trim() || 'Note',
      title: input.title,
      timestamp: input.now.toISOString(),
    }, { lineWidth: 0 }).trimEnd();
    return `---\n${frontmatter}\n---\n\n${source}`;
  }

  // The closing `---` consumes one newline; strip any remaining blank-line
  // separator so re-emitting with a single `\n\n` does not double it.
  const body = (match[2] ?? '').replace(/^\r?\n+/, '');
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]!);
  } catch {
    throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content has invalid YAML frontmatter');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content frontmatter must be an object');
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.type === 'string' && record.type.trim()) {
    return source;
  }

  // Missing/empty type: derive it when a fallback is available (moves/imports),
  // otherwise require the author to supply one.
  const fallbackType = input.fallbackType?.trim();
  if (!fallbackType) {
    throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content frontmatter requires a non-empty type');
  }
  const rest = { ...record };
  delete rest.type;
  const frontmatter = stringifyYaml({ type: fallbackType, ...rest }, { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${body}`;
}
