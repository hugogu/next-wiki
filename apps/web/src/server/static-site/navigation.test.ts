import { describe, expect, it } from 'vitest';
import type { PublishablePage, PublishableSet } from './eligibility';
import { addressKey } from './eligibility';
import {
  buildBreadcrumbs,
  buildLanguageOptions,
  buildNavTree,
  buildSitemap,
  localeHomeHref,
  publishedLocales,
} from './navigation';

const BASE_URL = 'https://owner.github.io/repo/';

function page(overrides: Partial<PublishablePage> & { path: string }): PublishablePage {
  return {
    id: `id-${overrides.path}-${overrides.locale ?? 'en'}`,
    spaceId: 'space',
    title: overrides.path,
    slug: overrides.path,
    locale: 'en',
    translationGroupId: null,
    revisionId: 'rev',
    versionNumber: 1,
    contentSource: '',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function set(pages: PublishablePage[], defaultLocale = 'en'): PublishableSet {
  const pageIdsByAddress = new Map<string, string>();
  const slugByAddress = new Map<string, string>();
  const translationGroups = new Map<string, Map<string, string>>();
  for (const p of pages) {
    const key = addressKey(p.locale, p.path);
    pageIdsByAddress.set(key, p.id);
    slugByAddress.set(key, p.slug);
    if (p.translationGroupId) {
      const group = translationGroups.get(p.translationGroupId) ?? new Map();
      group.set(p.locale, p.slug);
      translationGroups.set(p.translationGroupId, group);
    }
  }
  return {
    pages,
    pageIdsByAddress,
    slugByAddress,
    translationGroups,
    aliasesByPageId: new Map(),
    assetIds: new Set(),
    exclusions: {},
    defaultLocale,
  };
}

describe('buildNavTree', () => {
  it('nests pages under their path ancestors', () => {
    const tree = buildNavTree(
      set([
        page({ path: 'guides', title: 'Guides' }),
        page({ path: 'guides/setup', title: 'Setup' }),
      ]),
      BASE_URL,
      'en',
    );
    expect(tree).toHaveLength(1);
    expect(tree[0]!.title).toBe('Guides');
    expect(tree[0]!.children[0]!.title).toBe('Setup');
  });

  it('creates a folder node for an ancestor that has no page of its own', () => {
    // The wiki allows a/b/c without a/b existing; flattening those levels would
    // not match how the author organized the content.
    const tree = buildNavTree(set([page({ path: 'a/b/c', title: 'C' })]), BASE_URL, 'en');
    expect(tree[0]!.href).toBeNull();
    expect(tree[0]!.children[0]!.href).toBeNull();
    expect(tree[0]!.children[0]!.children[0]!.title).toBe('C');
  });

  it('contains only the requested locale', () => {
    const pages = [
      page({ path: 'a', title: 'A', locale: 'en' }),
      page({ path: 'a', title: '甲', locale: 'zh' }),
    ];
    expect(buildNavTree(set(pages), BASE_URL, 'zh')[0]!.title).toBe('甲');
  });
});

describe('buildBreadcrumbs', () => {
  it('links ancestors that are published pages', () => {
    const target = page({ path: 'guides/setup', title: 'Setup' });
    const crumbs = buildBreadcrumbs(
      set([page({ path: 'guides', title: 'Guides' }), target]),
      BASE_URL,
      target,
    );
    expect(crumbs.map((c) => c.title)).toEqual(['Guides', 'Setup']);
    expect(crumbs[0]!.href).toBe('/repo/guides/');
  });

  it('leaves an unpublished ancestor unlinked rather than pointing at nothing', () => {
    // The site promises zero dead internal links, so a missing ancestor is
    // plain text.
    const target = page({ path: 'guides/setup', title: 'Setup' });
    const crumbs = buildBreadcrumbs(set([target]), BASE_URL, target);
    expect(crumbs[0]!.href).toBeNull();
  });

  it('never links the page itself', () => {
    const target = page({ path: 'a', title: 'A' });
    expect(buildBreadcrumbs(set([target]), BASE_URL, target)[0]!.href).toBeNull();
  });
});

describe('buildLanguageOptions', () => {
  it('offers nothing on a single-language site', () => {
    const only = page({ path: 'a', title: 'A' });
    expect(buildLanguageOptions(set([only]), BASE_URL, only)).toEqual([]);
  });

  it('links straight to a translation that exists', () => {
    const en = page({ path: 'a', title: 'A', locale: 'en', translationGroupId: 'g' });
    const zh = page({ path: 'a', title: '甲', locale: 'zh', translationGroupId: 'g' });
    const options = buildLanguageOptions(set([en, zh]), BASE_URL, en);
    expect(options).toEqual([{ locale: 'zh', href: '/repo/zh/a/', available: true }]);
  });

  it('still offers a language this page lacks, pointing at that language home', () => {
    // A reader can only be told a translation is missing if the language is
    // shown at all (FR-025).
    const en = page({ path: 'only-english', title: 'Only English', locale: 'en' });
    const otherZh = page({ path: 'other', title: '其他', locale: 'zh' });
    const options = buildLanguageOptions(set([en, otherZh]), BASE_URL, en);
    expect(options).toEqual([{ locale: 'zh', href: '/repo/zh/', available: false }]);
  });

  it('does not offer the reader the language they are already reading', () => {
    const en = page({ path: 'a', title: 'A', locale: 'en', translationGroupId: 'g' });
    const zh = page({ path: 'a', title: '甲', locale: 'zh', translationGroupId: 'g' });
    expect(buildLanguageOptions(set([en, zh]), BASE_URL, zh).map((o) => o.locale)).toEqual(['en']);
  });
});

describe('localeHomeHref', () => {
  it('maps the default locale to the site root', () => {
    expect(localeHomeHref(BASE_URL, 'en', 'en')).toBe('/repo/');
  });

  it('prefixes any other locale', () => {
    expect(localeHomeHref(BASE_URL, 'zh', 'en')).toBe('/repo/zh/');
  });
});

describe('publishedLocales', () => {
  it('lists each locale once, sorted', () => {
    const pages = [
      page({ path: 'a', locale: 'zh' }),
      page({ path: 'b', locale: 'en' }),
      page({ path: 'c', locale: 'zh' }),
    ];
    expect(publishedLocales(set(pages))).toEqual(['en', 'zh']);
  });
});

describe('buildSitemap', () => {
  it('lists absolute addresses for every published page', () => {
    const xml = buildSitemap(set([page({ path: 'a' }), page({ path: 'b' })]), BASE_URL);
    expect(xml).toContain('<loc>https://owner.github.io/repo/a/</loc>');
    expect(xml).toContain('<loc>https://owner.github.io/repo/b/</loc>');
  });

  it('escapes characters that would break the XML', () => {
    const xml = buildSitemap(set([page({ path: 'a&b' })]), BASE_URL);
    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
});
