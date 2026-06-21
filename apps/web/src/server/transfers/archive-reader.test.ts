import { describe, expect, it } from 'vitest';
import { normalizeArchiveEntryName } from './archive-reader';

describe('archive reader path safety', () => {
  it.each([
    '../escape.md',
    '/absolute.md',
    'C:/drive.md',
    'pages\\evil.md',
    'pages/./evil.md',
    'pages//evil.md',
    'pages/\0evil.md',
  ])('rejects unsafe entry %s', (entry) => {
    expect(() => normalizeArchiveEntryName(entry)).toThrow();
  });

  it('normalizes a safe portable entry', () => {
    expect(normalizeArchiveEntryName('pages/en/docs/start.md')).toBe('pages/en/docs/start.md');
  });
});
