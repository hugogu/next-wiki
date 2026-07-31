import { describe, expect, it } from 'vitest';
import { staticSiteBasePath } from '@next-wiki/shared';
import {
  artifactHref,
  describeConflict,
  encodeHrefPath,
  findPathConflicts,
  normalizePathSegments,
  pageAddress,
} from './paths';

describe('staticSiteBasePath', () => {
  it('reduces a domain root to a single slash', () => {
    expect(staticSiteBasePath('https://wiki.example.com')).toBe('/');
    expect(staticSiteBasePath('https://wiki.example.com/')).toBe('/');
  });

  it('keeps a project sub-path in leading-and-trailing-slash form', () => {
    expect(staticSiteBasePath('https://owner.github.io/repo')).toBe('/repo/');
    expect(staticSiteBasePath('https://owner.github.io/repo/')).toBe('/repo/');
  });

  it('handles a nested sub-path', () => {
    expect(staticSiteBasePath('https://example.com/a/b/')).toBe('/a/b/');
  });
});

describe('normalizePathSegments', () => {
  it('drops empty and whitespace-only segments', () => {
    expect(normalizePathSegments('/guides//setup/')).toBe('guides/setup');
  });

  it('normalizes decomposed characters to composed form', () => {
    // macOS hands out NFD; most other sources hand out NFC. Without this the
    // same visible path becomes two directories. Written as explicit code
    // points so the two spellings really do differ in this source file.
    const nfd = 'cafe\u0301/menu'; // e + combining acute
    const nfc = 'caf\u00e9/menu'; // precomposed e-acute
    expect(nfd).not.toBe(nfc);
    expect(normalizePathSegments(nfd)).toBe(normalizePathSegments(nfc));
    expect(normalizePathSegments(nfd)).toBe(nfc);
  });

  it('preserves CJK path segments unchanged', () => {
    expect(normalizePathSegments('指南/安装')).toBe('指南/安装');
  });
});

describe('encodeHrefPath', () => {
  it('encodes each segment but keeps separators', () => {
    expect(encodeHrefPath('guides/getting started')).toBe('guides/getting%20started');
  });

  it('encodes CJK segments', () => {
    expect(encodeHrefPath('指南')).toBe(encodeURIComponent('指南'));
  });
});

describe('pageAddress', () => {
  it('emits directory-form addresses so reader URLs match the wiki', () => {
    const address = pageAddress('https://owner.github.io/repo/', 'guides/setup', 'en', 'en');
    expect(address.filePath).toBe('guides/setup/index.html');
    expect(address.href).toBe('/repo/guides/setup/');
  });

  it('resolves against a domain root', () => {
    const address = pageAddress('https://wiki.example.com/', 'guides/setup', 'en', 'en');
    expect(address.href).toBe('/guides/setup/');
  });

  it('prefixes a non-default locale, matching the reader route convention', () => {
    const address = pageAddress('https://wiki.example.com/', 'guides/setup', 'zh', 'en');
    expect(address.filePath).toBe('zh/guides/setup/index.html');
    expect(address.href).toBe('/zh/guides/setup/');
  });

  it('does not prefix the default locale', () => {
    expect(pageAddress('https://x.test/', 'a', 'en', 'en').filePath).toBe('a/index.html');
  });

  it('maps an empty path to the site root', () => {
    const address = pageAddress('https://owner.github.io/repo/', '', null, 'en');
    expect(address.filePath).toBe('index.html');
    expect(address.href).toBe('/repo/');
  });
});

describe('artifactHref', () => {
  it('resolves internal resources against the base path', () => {
    expect(artifactHref('https://owner.github.io/repo/', '_static/site.css')).toBe(
      '/repo/_static/site.css',
    );
  });

  it('tolerates a leading slash on the relative path', () => {
    expect(artifactHref('https://x.test/', '/_assets/a.png')).toBe('/_assets/a.png');
  });
});

describe('findPathConflicts', () => {
  it('accepts ordinary distinct paths', () => {
    expect(
      findPathConflicts(
        [
          { path: 'guides/setup', locale: 'en' },
          { path: 'guides/usage', locale: 'en' },
        ],
        'en',
      ),
    ).toEqual([]);
  });

  it('flags a page claiming a reserved prefix', () => {
    const conflicts = findPathConflicts([{ path: '_assets/logo', locale: 'en' }], 'en');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'reserved', reserved: '_assets' });
  });

  it('flags a page claiming a reserved root file', () => {
    const conflicts = findPathConflicts([{ path: 'sitemap.xml', locale: 'en' }], 'en');
    expect(conflicts[0]).toMatchObject({ kind: 'reserved' });
  });

  it('flags two paths differing only in letter case', () => {
    // A static host's filesystem cannot distinguish these, so one would
    // silently overwrite the other.
    const conflicts = findPathConflicts(
      [
        { path: 'Guides/Setup', locale: 'en' },
        { path: 'guides/setup', locale: 'en' },
      ],
      'en',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'case' });
  });

  it('does not flag the same path in different locales', () => {
    // These live at different addresses, so they never collide.
    expect(
      findPathConflicts(
        [
          { path: 'guides/setup', locale: 'en' },
          { path: 'guides/setup', locale: 'zh' },
        ],
        'en',
      ),
    ).toEqual([]);
  });

  it('does not flag a path that merely starts with a reserved word', () => {
    expect(findPathConflicts([{ path: '_assetsmith/notes', locale: 'en' }], 'en')).toEqual([]);
  });
});

describe('describeConflict', () => {
  it('names both paths in a case conflict so the operator can act', () => {
    const message = describeConflict({
      kind: 'case',
      path: 'guides/setup',
      conflictsWith: 'Guides/Setup',
    });
    expect(message).toContain('guides/setup');
    expect(message).toContain('Guides/Setup');
  });

  it('names the reserved word in a reserved conflict', () => {
    expect(
      describeConflict({ kind: 'reserved', path: '_assets/x', reserved: '_assets' }),
    ).toContain('_assets');
  });
});
