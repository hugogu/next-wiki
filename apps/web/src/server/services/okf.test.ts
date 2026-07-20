import { describe, expect, it } from 'vitest';
import { deriveOkfTypeFromPath, ensureOkfConceptPath, ensureOkfConformance } from './okf';

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

  describe('fallbackType (bulk move/import)', () => {
    it.each([
      ['docs/api/foo', 'docs/api'],
      ['docs/foo', 'docs'],
      ['foo', 'foo'],
      ['', 'Note'],
    ])('derives a type from path %s → %s', (path, expected) => {
      expect(deriveOkfTypeFromPath(path)).toBe(expected);
    });

    it('injects the derived type when there is no frontmatter', () => {
      const result = ensureOkfConformance('# Body', { title: 'T', now, fallbackType: 'docs/api' });
      expect(result).toBe('---\ntype: docs/api\ntitle: T\ntimestamp: 2026-07-18T12:00:00.000Z\n---\n\n# Body');
    });

    it('adds the derived type to existing frontmatter that lacks one, preserving keys and body', () => {
      const source = '---\ntitle: Imported\nowner: platform\n---\n\n# Body\n\nText.';
      const result = ensureOkfConformance(source, { title: 'Imported', now, fallbackType: 'guides' });
      expect(result).toBe('---\ntype: guides\ntitle: Imported\nowner: platform\n---\n\n# Body\n\nText.');
    });

    it('overwrites an empty type with the derived type', () => {
      const source = '---\ntype: ""\nowner: x\n---\n\n# B';
      const result = ensureOkfConformance(source, { title: 'B', now, fallbackType: 'reference' });
      expect(result).toContain('type: reference');
      expect(result).toContain('owner: x');
    });

    it('leaves a valid explicit type untouched even when a fallback is supplied', () => {
      const source = '---\ntype: Service\n---\n\n# S';
      expect(ensureOkfConformance(source, { title: 'S', now, fallbackType: 'ignored' })).toBe(source);
    });

    it('still rejects unparseable frontmatter even with a fallback', () => {
      expectDomainError(
        () => ensureOkfConformance('---\ntype: [\n---\n\n# X', { title: 'X', now, fallbackType: 'y' }),
        'OKF_TYPE_REQUIRED',
      );
    });
  });
});
