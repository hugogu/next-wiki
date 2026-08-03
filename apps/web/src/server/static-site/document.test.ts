import { describe, expect, it } from 'vitest';
import type { DocumentAssets, DocumentStrings, RenderDocumentInput } from './document';
import { renderDocument, renderHomeDocument, renderNotFoundDocument } from './document';
import type { Breadcrumb, LanguageOption, NavNode } from './navigation';
import type { Heading } from '@/lib/html';

/**
 * The published document shell is a read-only artifact: it must not carry any
 * affordance that would let a reader edit the wiki, start an AI chat, sign in,
 * or reach an admin surface. It also must be self-contained: every address the
 * shell generates resolves inside the artifact, with the single exception of the
 * canonical metadata link.
 */

const BASE_URL = 'https://owner.github.io/repo/';
const BASE_PATH = '/repo/';

const ASSETS: DocumentAssets = {
  stylesheet: '_static/site.abc123.css',
  script: '_static/site.def456.js',
  katexStylesheet: '_static/katex.789.css',
};

const STRINGS: DocumentStrings = {
  siteName: 'Test Wiki',
  search: 'Search',
  searchPlaceholder: 'Search pages…',
  home: 'Home',
  onThisPage: 'On this page',
  toggleTheme: 'Toggle theme',
  languages: 'Languages',
  noResults: 'No results',
  translationMissing: 'Not available in this language',
};

function nav(): NavNode[] {
  return [
    {
      title: 'Guides',
      href: `${BASE_PATH}guides/`,
      path: 'guides',
      children: [
        { title: 'Setup', href: `${BASE_PATH}guides/setup/`, path: 'guides/setup', children: [] },
      ],
    },
  ];
}

function breadcrumbs(): Breadcrumb[] {
  return [{ title: 'Guides', href: `${BASE_PATH}guides/` }];
}

function headings(): Heading[] {
  return [{ level: 2, text: 'First section', id: 'first-section' }];
}

function languages(): LanguageOption[] {
  return [{ locale: 'zh', href: `${BASE_PATH}zh/`, available: false }];
}

function baseInput(body: string): RenderDocumentInput {
  return {
    title: 'Page title',
    bodyHtml: body,
    locale: 'en',
    basePath: BASE_PATH,
    assets: ASSETS,
    themeCss: '.prose.prose{line-height:1.75}',
    nav: nav(),
    breadcrumbs: breadcrumbs(),
    headings: headings(),
    languages: languages(),
    strings: STRINGS,
    canonicalUrl: `${BASE_URL}page/`,
    description: 'A test page',
  };
}

function allHrefs(html: string): { element: string; href: string }[] {
  const matches: { element: string; href: string }[] = [];
  for (const match of html.matchAll(/<([a-z0-9]+)\b[^>]*\shref\s*=\s*(["'])([^"']*)\2/gi)) {
    matches.push({ element: match[1]!, href: match[3]! });
  }
  return matches;
}

function allSrcs(html: string): { element: string; src: string }[] {
  const matches: { element: string; src: string }[] = [];
  for (const match of html.matchAll(/<([a-z0-9]+)\b[^>]*\ssrc\s*=\s*(["'])([^"']*)\2/gi)) {
    matches.push({ element: match[1]!, src: match[3]! });
  }
  return matches;
}

function shellOnly(html: string, body: string): string {
  const before = html.indexOf(body);
  if (before === -1) return html;
  return html.slice(0, before) + html.slice(before + body.length);
}

function isArtifactInternal(href: string, basePath: string): boolean {
  return href.startsWith(basePath) || href.startsWith('#');
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:|\/\//i.test(href);
}

describe('document shell affordances', () => {
  it('renders a page document without edit, AI, admin, account, or sign-in controls', () => {
    const body = '<p>__TEST_BODY__</p>';
    const html = renderDocument(baseInput(body));

    const shell = shellOnly(html, body);

    // The shell must be free of any interactive affordance reserved for signed-in
    // or privileged users. These are checked as whole-word-ish tokens that appear
    // in UI labels, not as accidental substrings of prose.
    const forbidden = [
      /\bedit\b/i,
      /sign\s*in/i,
      /sign-in/i,
      /log\s*in/i,
      /login/i,
      /\baccount\b/i,
      /\badmin\b/i,
      /\bsettings\b/i,
      /\bnew\s+page\b/i,
      /ai\s+assistant/i,
      /\bchat\b/i,
    ];
    for (const pattern of forbidden) {
      expect(shell).not.toMatch(pattern);
    }

    // No form elements, buttons, or inputs that could submit data or mutate state.
    expect(shell).not.toMatch(/<button\b/i);
    expect(shell).not.toMatch(/<form\b/i);
    expect(shell).not.toMatch(/<input\b/i);
    expect(shell).not.toMatch(/<select\b/i);
    expect(shell).not.toMatch(/<textarea\b/i);
  });

  it('renders the home document without edit, AI, admin, account, or sign-in controls', () => {
    const html = renderHomeDocument({
      ...baseInput(''),
      localeSections: [{ locale: 'en', label: 'English', count: 1, nav: nav() }],
    });
    const shell = shellOnly(html, '<nav');
    for (const pattern of [
      /\bedit\b/i,
      /sign\s*in/i,
      /\baccount\b/i,
      /\badmin\b/i,
      /ai\s+assistant/i,
      /\bchat\b/i,
    ]) {
      expect(shell).not.toMatch(pattern);
    }
    expect(shell).not.toMatch(/<button\b/i);
    expect(shell).not.toMatch(/<form\b/i);
    expect(shell).not.toMatch(/<input\b/i);
  });

  it('renders the not-found document without edit, AI, admin, account, or sign-in controls', () => {
    const html = renderNotFoundDocument(baseInput(''), 'Page not found.');
    const shell = shellOnly(html, 'Page not found');
    for (const pattern of [
      /\bedit\b/i,
      /sign\s*in/i,
      /\baccount\b/i,
      /\badmin\b/i,
      /ai\s+assistant/i,
      /\bchat\b/i,
    ]) {
      expect(shell).not.toMatch(pattern);
    }
    expect(shell).not.toMatch(/<button\b/i);
    expect(shell).not.toMatch(/<form\b/i);
    expect(shell).not.toMatch(/<input\b/i);
  });
});

describe('document shell self-containment', () => {
  it('resolves every href and src inside the artifact, except the canonical link', () => {
    const body = '<p><a href="#section">anchor</a></p>';
    const html = renderDocument(baseInput(body));

    for (const { element, href } of allHrefs(html)) {
      if (element === 'link' && html.includes(`rel="canonical" href="${href}"`)) {
        // Canonical link is the only deliberately external reference.
        expect(isExternal(href)).toBe(true);
        continue;
      }
      expect(isArtifactInternal(href, BASE_PATH)).toBe(true);
    }

    for (const { src } of allSrcs(html)) {
      expect(isArtifactInternal(src, BASE_PATH)).toBe(true);
      expect(src).toMatch(/^\/repo\/_static\//);
    }
  });

  it('keeps the home page href/src inside the artifact', () => {
    const html = renderHomeDocument({
      ...baseInput(''),
      localeSections: [{ locale: 'en', label: 'English', count: 1, nav: nav() }],
    });

    for (const { element, href } of allHrefs(html)) {
      if (element === 'link' && html.includes(`rel="canonical"`)) continue;
      expect(isArtifactInternal(href, BASE_PATH)).toBe(true);
    }

    for (const { src } of allSrcs(html)) {
      expect(isArtifactInternal(src, BASE_PATH)).toBe(true);
    }
  });

  it('keeps the not-found page href/src inside the artifact', () => {
    const html = renderNotFoundDocument(baseInput(''), 'Missing page.');

    for (const { element, href } of allHrefs(html)) {
      if (element === 'link' && html.includes(`rel="canonical"`)) continue;
      expect(isArtifactInternal(href, BASE_PATH)).toBe(true);
    }

    for (const { src } of allSrcs(html)) {
      expect(isArtifactInternal(src, BASE_PATH)).toBe(true);
    }
  });

  it('references the content-hashed stylesheet and script from the reserved static prefix', () => {
    const html = renderDocument(baseInput('<p>x</p>'));
    expect(html).toContain('href="/repo/_static/site.abc123.css"');
    expect(html).toContain('href="/repo/_static/katex.789.css"');
    expect(html).toMatch(
      /<script\s+type="module"\s+src="\/repo\/_static\/site\.def456\.js">\u003c\/script>/,
    );
  });
});

describe('document search language', () => {
  it('passes the forced search index language to the search island', () => {
    const html = renderDocument({ ...baseInput('<p>x</p>'), searchLanguage: 'zh' });
    expect(html).toContain('data-search-language="zh"');
  });

  it('omits the language attribute on single-language sites', () => {
    const html = renderDocument(baseInput('<p>x</p>'));
    expect(html).not.toContain('data-search-language');
  });

  it('passes the search language through the home and not-found shells', () => {
    const home = renderHomeDocument({
      ...baseInput(''),
      searchLanguage: 'zh',
      localeSections: [{ locale: 'en', label: 'English', count: 1, nav: nav() }],
    });
    expect(home).toContain('data-search-language="zh"');

    const notFound = renderNotFoundDocument(
      { ...baseInput(''), searchLanguage: 'zh' },
      'Missing page.',
    );
    expect(notFound).toContain('data-search-language="zh"');
  });
});
