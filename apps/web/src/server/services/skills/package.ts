import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  SKILL_LIMITS,
  skillDescriptionSchema,
  skillNameSchema,
  type SkillFileKind,
  type SkillRejectionReason,
} from '@next-wiki/shared';

/**
 * Skill package parsing and validation (028).
 *
 * A skill package is the layout Anthropic publishes: a directory with a
 * `SKILL.md` whose YAML frontmatter declares `name` and `description`, plus any
 * reference files and scripts. Keeping the format unchanged is the point — a
 * skill written for another Claude-based tool must load here without
 * conversion.
 *
 * Nothing in this module executes anything. Files are read as text and returned
 * as text; scripts are reference material in this release.
 */

export const INSTRUCTION_FILE = 'SKILL.md';

export type ParsedInstruction = {
  name: string;
  description: string;
  /** The Markdown body after the frontmatter block. */
  body: string;
};

export type ParseFailure = { reason: SkillRejectionReason; detail: string };

export type ParseResult =
  | { ok: true; value: ParsedInstruction }
  | { ok: false; error: ParseFailure };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse and validate `SKILL.md`. Every failure carries a specific, actionable
 * reason: an admin looking at a rejected package should not have to guess which
 * of five things is wrong with it.
 */
export function parseInstructionFile(source: string): ParseResult {
  const match = FRONTMATTER.exec(source);
  if (!match) {
    return {
      ok: false,
      error: {
        reason: 'invalid_frontmatter',
        detail: `${INSTRUCTION_FILE} must start with a YAML frontmatter block delimited by --- lines.`,
      },
    };
  }
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1]!);
  } catch (error) {
    return {
      ok: false,
      error: {
        reason: 'invalid_frontmatter',
        detail: `The YAML frontmatter could not be parsed: ${error instanceof Error ? error.message : 'unknown error'}`,
      },
    };
  }
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return {
      ok: false,
      error: { reason: 'invalid_frontmatter', detail: 'The frontmatter must be a YAML mapping.' },
    };
  }
  const record = frontmatter as Record<string, unknown>;
  const name = skillNameSchema.safeParse(record.name);
  if (!name.success) {
    return {
      ok: false,
      error: {
        reason: 'invalid_frontmatter',
        detail:
          'The frontmatter must declare a "name" of lowercase words separated by single hyphens, 1-64 characters.',
      },
    };
  }
  const description = skillDescriptionSchema.safeParse(record.description);
  if (!description.success) {
    return {
      ok: false,
      error: {
        reason: 'invalid_frontmatter',
        detail: 'The frontmatter must declare a non-empty "description" of at most 1024 characters.',
      },
    };
  }
  return {
    ok: true,
    value: {
      name: name.data,
      description: description.data,
      body: source.slice(match[0].length),
    },
  };
}

/** Compose an instruction file from its parts. Used when creating a skill and
 * when rendering the shipped default of a built-in one. */
export function buildInstructionFile(input: {
  name: string;
  description: string;
  body: string;
}): string {
  // Quote both values: a description routinely contains a colon, which would
  // otherwise turn the line into a nested mapping.
  return [
    '---',
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(input.description)}`,
    '---',
    '',
    input.body.replace(/^\n+/, ''),
  ].join('\n');
}

/** Classify a file by its location in the package. Kind is presentational: it
 * never changes how a file is handled, because no file is ever executed. */
export function classifyFile(relativePath: string): SkillFileKind {
  if (relativePath === INSTRUCTION_FILE) return 'instruction';
  const first = relativePath.split('/')[0];
  if (first === 'scripts') return 'script';
  return 'reference';
}

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.py': 'text/x-python',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.css': 'text/css',
  '.sql': 'application/sql',
  '.toml': 'application/toml',
};

export function contentTypeFor(relativePath: string): string {
  return CONTENT_TYPES[path.extname(relativePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Whether a file can be shown and edited inline. Binary and oversized files
 * are listed by name, type, and size instead (FR-037). */
export function isViewable(relativePath: string, byteSize: number): boolean {
  if (byteSize > SKILL_LIMITS.maxFileBytes) return false;
  return contentTypeFor(relativePath) !== 'application/octet-stream';
}

/**
 * Normalise a caller-supplied path and confirm it stays inside the package.
 * Returns null for anything that escapes — absolute paths, `..` traversal,
 * backslashes, or an empty result. Callers must treat null as a hard rejection
 * and MUST call this before touching storage or the filesystem (FR-029).
 */
export function safeRelativePath(input: string): string | null {
  if (!input || input.startsWith('/') || input.includes('\\') || input.includes('\0')) return null;
  const normalized = path.posix.normalize(input);
  if (
    normalized.startsWith('..') ||
    normalized.startsWith('/') ||
    normalized === '.' ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    return null;
  }
  return normalized;
}

/**
 * Confirm a resolved filesystem path is still inside its package after symlinks
 * have been followed. A symlink pointing outside the package is exactly the
 * case `safeRelativePath` cannot catch, because the traversal happens in the
 * filesystem rather than in the string.
 */
export function isInsidePackage(packageRoot: string, resolvedPath: string): boolean {
  const root = path.resolve(packageRoot);
  const target = path.resolve(resolvedPath);
  if (target === root) return true;
  return target.startsWith(`${root}${path.sep}`);
}
