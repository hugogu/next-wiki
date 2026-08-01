import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/i18n/client';
import { messages } from '@/i18n/catalog';
import { defaultLocale, isLocale, type UiLocale } from '@/i18n/config';
import { ThemeProvider, useTheme } from '@/components/theme/ThemeProvider';
import { CodeBlock } from '@/components/renderer/CodeBlock';
import { MermaidBlock } from '@/components/renderer/MermaidBlock';
import { MathPlotLayer } from '@/components/renderer/MathPlotLayer';

/**
 * Client runtime for the published static site.
 *
 * It mounts the wiki's own renderer components onto the markers the rendering
 * pipeline already emits (`data-code-block`, `data-mermaid-block`), so code
 * blocks, diagrams, and math plots behave exactly as they do in the app.
 *
 * The difference from `ContentRenderer` is only where the HTML comes from: in
 * the app it arrives as a prop and is injected; here it is already in the
 * document, delivered by the host. Everything mounted is the same component.
 *
 * Bundled once at image build time — this file is not part of the Next build.
 */

type ThemeMode = 'light' | 'dark' | 'auto';

/** Each island is its own React root, so the original markup is captured before
 *  the first mount: a re-render must not depend on DOM React has replaced. */
type Island = {
  element: HTMLElement;
  render: (mode: ThemeMode) => React.ReactNode;
};

const THEME_STORAGE_KEY = 'next-wiki-theme';
const THEME_EVENT = 'next-wiki-static-theme';

const roots = new Map<HTMLElement, Root>();
const islands: Island[] = [];

function currentLocale(): UiLocale {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : defaultLocale;
}

function storedMode(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

/**
 * Render one island.
 *
 * `key={mode}` is what makes a theme change reach every island: each root holds
 * its own ThemeProvider whose state initializes once, so changing the key
 * rebuilds the subtree and re-reads the mode. Without it, only the toggle's own
 * root would notice, and diagrams would keep their previous palette.
 */
function renderIsland(island: Island, mode: ThemeMode): void {
  const locale = currentLocale();
  const root = roots.get(island.element) ?? createRoot(island.element);
  roots.set(island.element, root);
  root.render(
    <I18nProvider initialLocale={locale} messages={messages[locale]}>
      <ThemeProvider key={mode} initialMode={mode}>
        {island.render(mode)}
      </ThemeProvider>
    </I18nProvider>,
  );
}

function addIsland(element: HTMLElement, render: Island['render']): void {
  const island = { element, render };
  islands.push(island);
  renderIsland(island, storedMode());
}

/**
 * The app's `ThemeToggle` cannot be reused here: it persists the choice to
 * `/api/user/preferences`, which on a published site would both fail and call
 * back to the wiki — exactly what the artifact promises not to do.
 *
 * Everything that matters is still shared. The mode, its resolution, the
 * `html.dark` class, and the storage key all come from the same
 * `ThemeProvider`, so a reader's choice behaves identically. Only the server
 * round-trip is dropped, because there is no server.
 */
function StaticThemeToggle({ label }: { label: string }) {
  const { mode, cycle } = useTheme();
  const initial = useRef(mode);

  useEffect(() => {
    if (mode === initial.current) return;
    initial.current = mode;
    // Other roots cannot see this provider's state, so the change is broadcast.
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
  }, [mode]);

  const glyph = mode === 'dark' ? '☾' : mode === 'light' ? '☀' : '◐';
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="rounded-sm px-sm py-xs text-sm text-muted hover:text-foreground"
    >
      {glyph}
    </button>
  );
}

/** Math plots read the rendered content out of the DOM, so the layer is given
 *  the document's content container rather than an HTML string. */
function StaticMathPlots({ container }: { container: HTMLElement }) {
  const ref = useRef<HTMLDivElement | null>(container as HTMLDivElement);
  return <MathPlotLayer containerRef={ref} html={container.innerHTML} locale={currentLocale()} />;
}

function hydrateCodeBlocks(): void {
  document.querySelectorAll<HTMLElement>('[data-code-block]').forEach((element) => {
    const pre = element.querySelector('pre');
    if (!pre) return;
    // Captured before mounting: CodeBlock replaces this element's children.
    const source = pre.textContent ?? '';
    const rawHtml = pre.outerHTML;
    addIsland(element, () => (
      <CodeBlock source={source}>
        <div dangerouslySetInnerHTML={{ __html: rawHtml }} />
      </CodeBlock>
    ));
  });
}

function hydrateMermaidBlocks(): void {
  document.querySelectorAll<HTMLElement>('[data-mermaid-block]').forEach((element) => {
    const pre = element.querySelector('pre');
    if (!pre) return;
    const source = pre.textContent ?? '';
    addIsland(element, () => <MermaidBlock source={source} />);
  });
}

function hydrateThemeToggle(): void {
  document.querySelectorAll<HTMLElement>('[data-static-site-theme]').forEach((element) => {
    const label = element.dataset.label ?? 'Toggle theme';
    addIsland(element, () => <StaticThemeToggle label={label} />);
  });
}

function hydrateMathPlots(): void {
  const content = document.querySelector<HTMLElement>('.prose');
  if (!content) return;
  const host = document.createElement('div');
  content.after(host);
  addIsland(host, () => <StaticMathPlots container={content} />);
}

function start(): void {
  hydrateCodeBlocks();
  hydrateMermaidBlocks();
  hydrateThemeToggle();
  hydrateMathPlots();

  window.addEventListener(THEME_EVENT, () => {
    const mode = storedMode();
    for (const island of islands) renderIsland(island, mode);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
