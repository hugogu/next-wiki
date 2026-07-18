import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DomainError } from '@/server/errors';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?(?:[\s\S]*)$/;

export function ensureOkfConceptPath(path: string): void {
  const leaf = path.normalize('NFC').split('/').at(-1)?.toLowerCase();
  if (leaf === 'index' || leaf === 'log') {
    throw new DomainError('OKF_RESERVED_PATH', `Generated concept paths cannot end in '${leaf}'`);
  }
}

export function ensureOkfConformance(
  source: string,
  input: { title: string; now: Date },
): string {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) {
    if (source.startsWith('---\n') || source.startsWith('---\r\n')) {
      throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content has invalid YAML frontmatter');
    }
    const frontmatter = stringifyYaml({
      type: 'Note',
      title: input.title,
      timestamp: input.now.toISOString(),
    }, { lineWidth: 0 }).trimEnd();
    return `---\n${frontmatter}\n---\n\n${source}`;
  }

  try {
    const parsed = parseYaml(match[1]!);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content frontmatter must be an object');
    }
    if (typeof parsed.type !== 'string' || !parsed.type.trim()) {
      throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content frontmatter requires a non-empty type');
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('OKF_TYPE_REQUIRED', 'Generated content has invalid YAML frontmatter');
  }

  return source;
}
