'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SearchIcon } from '@/components/icons';
import { useHybridPageSearch } from '@/hooks/useHybridPageSearch';
import { getSpaceHref, readerSpaceFromSlug } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

function getSearchTerms(query: string): string[] {
  const normalized = query.trim();
  if (!normalized) return [];
  return [...new Set(normalized.split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, terms: string[]) {
  if (!terms.length) return text;
  const pattern = terms.map(escapeRegExp).join('|');
  const matcher = new RegExp(`(${pattern})`, 'gi');
  const termSet = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return text.split(matcher).map((part, index) => {
    if (!part) return null;
    return termSet.has(part.toLocaleLowerCase())
      ? <mark key={`${part}-${index}`} className="rounded-sm bg-primary/20 px-0.5 text-foreground">{part}</mark>
      : part;
  });
}

function formatRelevance(score: number | undefined): string | null {
  if (score === undefined || Number.isNaN(score)) return null;
  return `${Math.round(score * 100)}%`;
}

function sourceLabelClass(source: 'keyword' | 'semantic'): string {
  return source === 'keyword'
    ? 'border-primary/30 bg-primary/10 text-primary'
    : 'border-warning/30 bg-warning/10 text-warning';
}

export function HeaderHybridSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchSessionId, setSearchSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const searchRecordRef = useRef<string | null>(null);
  const terminalEventRef = useRef(false);
  const resultsId = useId();
  const { data: results, error, isSearching, searchRecordId } = useHybridPageSearch({
    enabled: open,
    query,
    searchSessionId,
  });

  useEffect(() => {
    searchRecordRef.current = searchRecordId;
  }, [searchRecordId]);

  const close = useCallback((recordEscape: boolean) => {
    if (recordEscape && searchRecordRef.current && sessionRef.current && !terminalEventRef.current) {
      terminalEventRef.current = true;
      void fetch('/api/v1/search/pages', {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'behavior', eventId: crypto.randomUUID(), searchRecordId: searchRecordRef.current,
          searchSessionId: sessionRef.current, action: 'escape',
        }),
      });
    }
    setOpen(false);
    setQuery('');
    setSearchSessionId(null);
    searchRecordRef.current = null;
    sessionRef.current = null;
    previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  const openSearch = () => {
    if (!open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const sessionId = crypto.randomUUID();
      sessionRef.current = sessionId;
      setSearchSessionId(sessionId);
      terminalEventRef.current = false;
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus());
    }
  };
  const terms = getSearchTerms(query);
  const normalizedQuery = query.trim();
  const hasResults = Boolean(results?.items.length);
  const isFetchingMore = isSearching || results?.semanticState === 'pending';
  const loadingHint = normalizedQuery.length >= 2 && isFetchingMore
    ? results?.semanticState === 'pending' && hasResults
      ? t('header.search.loadingSemantic')
      : t('header.search.loadingHybrid')
    : null;
  const statusText = normalizedQuery.length < 2
    ? t('header.search.minChars')
    : error
      ? t('header.search.error')
      : results?.semanticState === 'unavailable' || results?.semanticState === 'failed'
        ? t('header.search.reducedCoverage')
        : hasResults
          ? t('header.search.escapeHint')
          : isFetchingMore
            ? t('header.search.searching')
            : t('header.search.noResults');

  return (
    <>
      {/* Only raise above modal overlays (z-50) while the search dropdown is
          open and needs to clear its own backdrop; otherwise stay below them so
          an open dialog dims the search box like the rest of the page. */}
      <div className={`absolute left-1/2 ${open ? 'z-[70]' : 'z-30'} w-[min(42rem,48vw)] -translate-x-1/2 max-lg:w-[min(28rem,42vw)]`}>
        <label className="sr-only" htmlFor="header-hybrid-search">{t('header.search.label')}</label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="header-hybrid-search" ref={inputRef} value={query} onFocus={openSearch} aria-describedby={open ? resultsId : undefined}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('header.search.placeholder')} className="h-9 w-full rounded-md border border-border bg-surface px-md pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>
      {open && <div data-testid="header-search-backdrop" onClick={() => close(true)} className="fixed inset-0 z-[55] bg-black/50" aria-hidden="true" />}
      {open && <section data-testid="header-search-results" className="fixed left-1/2 top-[calc(var(--header-height)+var(--space-sm))] z-[70] max-h-[calc(100vh-var(--header-height)-1rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-lg border border-border bg-surface p-md shadow-xl">
        <p id={resultsId} role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-x-md gap-y-xs text-sm text-muted">
          <span>{statusText}</span>
          {loadingHint && <span className="text-xs text-muted">{loadingHint}</span>}
        </p>
        {normalizedQuery.length >= 2 && isFetchingMore && (
          <div data-testid="header-search-progress" className="mt-sm h-2 overflow-hidden rounded-full bg-surface-elevated" aria-label={t('header.search.searching')}>
            <div className="header-search-progress-bar h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}
        <ul className="mt-sm space-y-xs">
          {results?.items.map((result) => <li key={result.page.id}>
            <a href={getSpaceHref(readerSpaceFromSlug(result.page.spaceSlug), result.page.path)} className="block rounded-md p-sm hover:bg-surface-elevated"
              onClick={() => {
                if (!searchRecordRef.current || !sessionRef.current || terminalEventRef.current) return;
                terminalEventRef.current = true;
                void fetch('/api/v1/search/pages', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'behavior', eventId: crypto.randomUUID(), searchRecordId: searchRecordRef.current, searchSessionId: sessionRef.current, action: 'result_open', pageId: result.page.id }) });
              }}>
              <span className="flex items-start justify-between gap-md">
                <span className="min-w-0 font-medium">{renderHighlightedText(result.page.title, terms)}</span>
                <span className="flex shrink-0 items-center gap-xs">
                  {result.page.rawCategorySystemKey === 'conversation' && (
                    <span data-testid="header-search-source-conversation" className="rounded-full border border-border bg-surface-elevated px-xs py-0.5 text-[11px] leading-tight text-muted">
                      {t('header.search.source.conversation')}
                    </span>
                  )}
                  {result.matchSources.map((source) => (
                    <span key={source} data-testid={`header-search-source-${source}`} className={`rounded-full border px-xs py-0.5 text-[11px] leading-tight ${sourceLabelClass(source)}`}>
                      {source === 'keyword' ? t('header.search.source.keyword') : t('header.search.source.semantic')}
                    </span>
                  ))}
                  {formatRelevance(result.relevanceScore) && (
                    <span className="rounded-full bg-surface-elevated px-sm py-0.5 text-xs text-muted">
                      {formatRelevance(result.relevanceScore)}
                    </span>
                  )}
                </span>
              </span>
              <span className="block text-xs text-muted">{renderHighlightedText(result.page.path, terms)}</span>
              {result.excerpt && <span className="mt-1 block text-sm text-muted">{renderHighlightedText(result.excerpt, terms)}</span>}
            </a>
          </li>)}
        </ul>
      </section>}
    </>
  );
}
