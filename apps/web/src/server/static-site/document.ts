import type { Heading } from '@/lib/html';
import type { Breadcrumb, LanguageOption, NavNode } from './navigation';

/**
 * The published document shell.
 *
 * This is hand-built HTML rather than a reuse of `@/components/ui/Layout`, and
 * that is a deliberate, narrow exception: `Layout` is a server component that
 * calls the auth service, reads the page tree from the database, and renders a
 * client `AppShell` with `usePathname` and `next/link`. None of that can run
 * outside a request, and none of it belongs in an artifact that must work with
 * the wiki switched off.
 *
 * What P6 actually requires is that visual resources flow through one design
 * system, and that holds: every class name here comes from the same
 * `globals.css` the app uses, every color and spacing value is a token, and the
 * compiled stylesheet is the app's own. Nothing is restyled — only re-assembled
 * without the runtime the app's shell depends on.
 */

export type DocumentAssets = {
  /** Content-hashed stylesheet path, relative to the artifact root. */
  stylesheet: string;
  /** Content-hashed client runtime path, relative to the artifact root. */
  script: string;
  /** KaTeX stylesheet path, relative to the artifact root. */
  katexStylesheet: string;
};

export type DocumentStrings = {
  siteName: string;
  search: string;
  searchPlaceholder: string;
  home: string;
  onThisPage: string;
  toggleTheme: string;
  languages: string;
  noResults: string;
  /** Shown on a language the current page has no version in. */
  translationMissing: string;
};

export type RenderDocumentInput = {
  title: string;
  /** Rendered, link-rewritten body HTML. */
  bodyHtml: string;
  locale: string;
  basePath: string;
  assets: DocumentAssets;
  /** Active content theme CSS from the wiki's own theme system, inlined so the
   *  published site matches the deployment's configured reading style. */
  themeCss: string;
  nav: NavNode[];
  breadcrumbs: Breadcrumb[];
  headings: Heading[];
  languages: LanguageOption[];
  strings: DocumentStrings;
  /** Canonical public address of this document, for metadata. */
  canonicalUrl: string;
  description: string;
  /** Optional reader-side analytics snippet already configured for the wiki. */
  analyticsSnippet?: string | null;
  /** False for synthetic pages that should never be a search result. */
  indexable?: boolean;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Applies the stored appearance choice before first paint.
 *
 * Inline and synchronous on purpose: deferring it to the bundle would show a
 * light flash on every navigation for a reader who chose dark. Uses the same
 * storage key and `html.dark` class as the app's ThemeProvider so a reader's
 * choice carries across both.
 */
const THEME_BOOTSTRAP = `(function(){try{var m=localStorage.getItem('next-wiki-theme');var d=m==='dark'||((m===null||m==='auto')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}})()`;

function renderNavNodes(nodes: NavNode[]): string {
  if (nodes.length === 0) return '';
  const items = nodes
    .map((node) => {
      const label = escapeHtml(node.title);
      const link = node.href
        ? `<a href="${escapeHtml(node.href)}" class="block rounded-sm px-sm py-xs text-sm hover:bg-surface-elevated">${label}</a>`
        : `<span class="block px-sm py-xs text-sm text-muted">${label}</span>`;
      return `<li>${link}${renderNavNodes(node.children)}</li>`;
    })
    .join('');
  return `<ul class="ml-sm border-l border-border pl-sm">${items}</ul>`;
}

function renderBreadcrumbs(crumbs: Breadcrumb[], basePath: string, homeLabel: string): string {
  if (crumbs.length === 0) return '';
  const parts = [
    `<a href="${escapeHtml(basePath)}" class="hover:underline">${escapeHtml(homeLabel)}</a>`,
    ...crumbs.map((crumb) =>
      crumb.href
        ? `<a href="${escapeHtml(crumb.href)}" class="hover:underline">${escapeHtml(crumb.title)}</a>`
        : `<span aria-current="page">${escapeHtml(crumb.title)}</span>`,
    ),
  ];
  return `<nav class="mb-md flex flex-wrap items-center gap-xs text-xs text-muted" aria-label="Breadcrumb">${parts.join(
    '<span aria-hidden="true">/</span>',
  )}</nav>`;
}

function renderToc(headings: Heading[], label: string): string {
  if (headings.length === 0) return '';
  const items = headings
    .map(
      (heading) =>
        `<li style="padding-left:${(heading.level - 2) * 12}px"><a href="#${escapeHtml(
          heading.id,
        )}" class="block py-xs text-xs text-muted hover:text-foreground">${escapeHtml(
          heading.text,
        )}</a></li>`,
    )
    .join('');
  return `<nav class="hidden xl:block" aria-label="${escapeHtml(label)}">
      <p class="mb-xs text-xs font-medium">${escapeHtml(label)}</p>
      <ul>${items}</ul>
    </nav>`;
}

function renderLanguages(
  languages: LanguageOption[],
  label: string,
  missingLabel: string,
): string {
  if (languages.length === 0) return '';
  const links = languages
    .map((option) => {
      // An unavailable language still links somewhere real — that language's
      // home page — and says why, rather than being silently absent.
      const title = option.available ? '' : ` title="${escapeHtml(missingLabel)}"`;
      const classes = option.available
        ? 'rounded-sm px-xs py-xs text-xs text-muted hover:text-foreground'
        : 'rounded-sm px-xs py-xs text-xs text-muted/60 italic hover:text-foreground';
      return `<a href="${escapeHtml(option.href)}" hreflang="${escapeHtml(
        option.locale,
      )}"${title} class="${classes}">${escapeHtml(option.locale.toUpperCase())}</a>`;
    })
    .join('');
  return `<div class="flex items-center gap-xs" aria-label="${escapeHtml(label)}">${links}</div>`;
}

export function renderDocument(input: RenderDocumentInput): string {
  const {
    title,
    bodyHtml,
    locale,
    basePath,
    assets,
    themeCss,
    nav,
    breadcrumbs,
    headings,
    languages,
    strings,
    canonicalUrl,
    description,
    analyticsSnippet,
    indexable = true,
  } = input;

  const asset = (path: string) => escapeHtml(`${basePath}${path}`);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(
  // The home page's title is the site name; suffixing it would repeat it.
  title === strings.siteName ? title : `${title} · ${strings.siteName}`,
)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<link rel="stylesheet" href="${asset(assets.stylesheet)}">
<link rel="stylesheet" href="${asset(assets.katexStylesheet)}">
<style>${themeCss}</style>
<script>${THEME_BOOTSTRAP}</script>
${analyticsSnippet ?? ''}
</head>
<body class="bg-background text-foreground">
<div class="mx-auto flex min-h-screen max-w-screen-2xl flex-col">
  <header data-pagefind-ignore class="sticky top-0 z-10 flex items-center justify-between gap-md border-b border-border bg-background px-lg py-sm">
    <a href="${escapeHtml(basePath)}" class="font-display text-lg font-semibold">${escapeHtml(
      strings.siteName,
    )}</a>
    <div class="flex items-center gap-sm">
      <div data-static-site-search data-base="${escapeHtml(basePath)}" data-placeholder="${escapeHtml(
        strings.searchPlaceholder,
      )}" data-label="${escapeHtml(strings.search)}" data-empty="${escapeHtml(
        strings.noResults,
      )}"></div>
      ${renderLanguages(languages, strings.languages, strings.translationMissing)}
      <div data-static-site-theme data-label="${escapeHtml(strings.toggleTheme)}"></div>
    </div>
  </header>

  <div class="flex flex-1 gap-lg px-lg py-md">
    <aside class="hidden w-nav shrink-0 md:block" data-pagefind-ignore aria-label="${escapeHtml(
      strings.home,
    )}">
      ${renderNavNodes(nav)}
    </aside>

    <main class="min-w-0 flex-1">
      <span data-pagefind-meta="title" hidden>${escapeHtml(title)}</span>
      ${renderBreadcrumbs(breadcrumbs, basePath, strings.home)}
      <!-- No title element here: the reader takes the heading from the Markdown
           body, and duplicating it would diverge from the wiki's own output. -->
      <div class="prose max-w-none"${indexable ? ' data-pagefind-body' : ''}>${bodyHtml}</div>
    </main>

    <aside class="w-nav shrink-0" data-pagefind-ignore>${renderToc(headings, strings.onThisPage)}</aside>
  </div>
</div>
<!-- The runtime is an ES module (code splitting keeps mermaid out of the
     initial payload), so it needs type="module" — which also defers it. -->
<script type="module" src="${asset(assets.script)}"></script>
</body>
</html>
`;
}

/** Site home page: the published content tree and nothing else. */
/**
 * Site home page.
 *
 * On a multilingual site this lists every language's tree, not just the
 * document's own. A wiki whose content is mostly in one language but whose
 * default locale is another would otherwise open on a nearly empty page, with
 * the actual content reachable only by noticing a two-letter language link —
 * the site would look like it published almost nothing.
 *
 * Sections are ordered by size, so the language a reader is most likely to want
 * comes first. A single-language site renders exactly as before, with no
 * section heading.
 */
export function renderHomeDocument(
  input: Omit<RenderDocumentInput, 'bodyHtml' | 'headings' | 'breadcrumbs'> & {
    /** Every published language's tree, largest first. */
    localeSections?: { locale: string; label: string; count: number; nav: NavNode[] }[];
  },
): string {
  const sections = input.localeSections ?? [];
  const body =
    sections.length > 1
      ? sections
          .map(
            (section) =>
              `<section><h2>${escapeHtml(section.label)} <span class="text-sm font-normal text-muted">(${
                section.count
              })</span></h2><nav aria-label="${escapeHtml(section.label)}">${renderNavNodes(
                section.nav,
              )}</nav></section>`,
          )
          .join('')
      : `<nav aria-label="${escapeHtml(input.strings.home)}">${renderNavNodes(
          sections[0]?.nav ?? input.nav,
        )}</nav>`;

  return renderDocument({
    ...input,
    bodyHtml: `<h1>${escapeHtml(input.title)}</h1>${body}`,
    headings: [],
    breadcrumbs: [],
  });
}

/** Not-found page, styled like the rest of the site (FR-005). */
export function renderNotFoundDocument(
  input: Omit<RenderDocumentInput, 'bodyHtml' | 'headings' | 'breadcrumbs' | 'languages'>,
  message: string,
): string {
  return renderDocument({
    ...input,
    // A fallback page is never something a reader searched for.
    indexable: false,
    bodyHtml: `<h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(
      message,
    )}</p><p><a href="${escapeHtml(input.basePath)}" class="underline">${escapeHtml(
      input.strings.home,
    )}</a></p>`,
    headings: [],
    breadcrumbs: [],
    languages: [],
  });
}
