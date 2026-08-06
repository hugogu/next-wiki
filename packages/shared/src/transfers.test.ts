import { describe, expect, it } from 'vitest';
import { transferRunCreateSchema, wikijsTransferOptionsSchema } from './transfers';

describe('wikijsTransferOptionsSchema', () => {
  it('defaults includeHistory to false and historyLimit to 300', () => {
    expect(wikijsTransferOptionsSchema.parse({})).toEqual({
      conflictStrategy: 'skip',
      includeHistory: false,
      historyLimit: 300,
    });
  });

  it('accepts an explicit historyLimit within bounds', () => {
    expect(wikijsTransferOptionsSchema.parse({ includeHistory: true, historyLimit: 50 })).toEqual({
      conflictStrategy: 'skip',
      includeHistory: true,
      historyLimit: 50,
    });
  });

  it('rejects a historyLimit outside the 1..2000 bound', () => {
    expect(() => wikijsTransferOptionsSchema.parse({ historyLimit: 0 })).toThrow();
    expect(() => wikijsTransferOptionsSchema.parse({ historyLimit: 2001 })).toThrow();
  });
});

describe('transferRunCreateSchema wikijs_preview branch', () => {
  it('defaults history options when only sourceId is provided', () => {
    const parsed = transferRunCreateSchema.parse({ kind: 'wikijs_preview', sourceId: '00000000-0000-0000-0000-000000000000' });
    if (parsed.kind !== 'wikijs_preview') throw new Error('expected wikijs_preview');
    expect(parsed.options).toEqual({ conflictStrategy: 'skip', includeHistory: false, historyLimit: 300 });
  });

  it('defaults history options on the archive_preview branch too', () => {
    const parsed = transferRunCreateSchema.parse({
      kind: 'archive_preview',
      sourceArtifactId: '00000000-0000-0000-0000-000000000000',
    });
    if (parsed.kind !== 'archive_preview') throw new Error('expected archive_preview');
    expect(parsed.options).toEqual({ conflictStrategy: 'skip', includeHistory: false, historyLimit: 300 });
  });

  it('defaults history options on the site_export branch', () => {
    const parsed = transferRunCreateSchema.parse({ kind: 'site_export' });
    if (parsed.kind !== 'site_export') throw new Error('expected site_export');
    expect(parsed.options).toEqual({ includeHistory: false, historyLimit: 300 });
  });
});
