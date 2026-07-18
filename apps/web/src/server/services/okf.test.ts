import { describe, expect, it } from 'vitest';
import { ensureOkfConceptPath, ensureOkfConformance } from './okf';

const now = new Date('2026-07-18T12:00:00.000Z');

function expectDomainError(action: () => void, code: string) {
  try {
    action();
    expect.unreachable('Expected a domain error');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('OKF conformance', () => {
  it('injects the minimum concept frontmatter when absent', () => {
    expect(ensureOkfConformance('# Concept', { title: 'Concept', now })).toBe(
      '---\ntype: Note\ntitle: Concept\ntimestamp: 2026-07-18T12:00:00.000Z\n---\n\n# Concept',
    );
  });

  it('preserves valid frontmatter and unknown keys byte-for-byte', () => {
    const source = '---\ntype: Service\nowner: platform\ncustom:\n  nested: true\n---\n\n# Service';
    expect(ensureOkfConformance(source, { title: 'Ignored', now })).toBe(source);
  });

  it.each([
    ['missing type', '---\ntitle: Missing\n---\n\n# Missing'],
    ['empty type', '---\ntype: ""\n---\n\n# Empty'],
    ['unparseable YAML', '---\ntype: [\n---\n\n# Invalid'],
    ['unterminated frontmatter', '---\ntype: Note\n# Invalid'],
  ])('rejects %s', (_name, source) => {
    expectDomainError(() => ensureOkfConformance(source, { title: 'Concept', now }), 'OKF_TYPE_REQUIRED');
  });

  it.each(['index', 'log', 'nested/index', 'nested/log'])('rejects reserved concept path %s', (path) => {
    expectDomainError(() => ensureOkfConceptPath(path), 'OKF_RESERVED_PATH');
  });

  it('accepts non-reserved concept paths', () => {
    expect(() => ensureOkfConceptPath('concepts/payment')).not.toThrow();
  });
});
