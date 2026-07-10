'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { HybridPageSearchResponse } from '@next-wiki/shared';
import { SearchIcon } from '@/components/icons';
import { getPageHref } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

type SearchStatus = 'idle' | 'searching' | 'error';

export function HeaderHybridSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HybridPageSearchResponse | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const runSearchRef = useRef<((value: string, searchRecordId: string, attempt: number) => Promise<void>) | null>(null);
  const sessionRef = useRef<string | null>(null);
  const searchRecordRef = useRef<string | null>(null);
  const terminalEventRef = useRef(false);
  const resultsId = useId();

  const close = useCallback((recordEscape: boolean) => {
    abortRef.current?.abort();
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
    setResults(null);
    setStatus('idle');
    searchRecordRef.current = null;
    sessionRef.current = null;
    requestRef.current += 1;
    previousFocusRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (value: string, searchRecordId: string, attempt: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('searching');
    try {
      const response = await fetch('/api/v1/search/pages', {
        method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'query', searchRecordId, searchSessionId: sessionRef.current, q: value, limit: 20 }),
      });
      if (!response.ok) throw new Error('search failed');
      const body = await response.json() as HybridPageSearchResponse;
      if (!open || attempt !== requestRef.current || value !== query.trim()) return;
      setResults(body);
      setStatus('idle');
      if (body.semanticState === 'pending') {
        window.setTimeout(() => void runSearchRef.current?.(value, searchRecordId, attempt), 350);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && attempt === requestRef.current) setStatus('error');
    }
  }, [open, query]);

  useEffect(() => {
    runSearchRef.current = runSearch;
  }, [runSearch]);

  useEffect(() => {
    if (!open) return;
    const normalized = query.trim();
    if (normalized.length < 2) {
      abortRef.current?.abort();
      queueMicrotask(() => {
        setResults(null);
        setStatus('idle');
      });
      searchRecordRef.current = null;
      return;
    }
    const id = crypto.randomUUID();
    searchRecordRef.current = id;
    const attempt = ++requestRef.current;
    void runSearch(normalized, id, attempt);
  }, [open, query, runSearch]);

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
      sessionRef.current = crypto.randomUUID();
      terminalEventRef.current = false;
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      <div className="absolute left-1/2 z-[60] w-[min(42rem,48vw)] -translate-x-1/2 max-lg:w-[min(28rem,42vw)]">
        <label className="sr-only" htmlFor="header-hybrid-search">{t('header.search.label')}</label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input id="header-hybrid-search" ref={inputRef} value={query} onFocus={openSearch}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('header.search.placeholder')} className="h-9 w-full rounded-md border border-border bg-surface px-md pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>
      {open && <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" />}
      {open && <section className="fixed left-1/2 top-header z-[60] max-h-[min(32rem,calc(100vh-4rem))] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-b-lg border border-border bg-surface p-md shadow-xl">
        <p id={resultsId} role="status" aria-live="polite" className="text-sm text-muted">
          {query.trim().length < 2 ? t('header.search.minChars') : status === 'searching' ? t('header.search.searching') : status === 'error' ? t('header.search.error') : results?.semanticState === 'unavailable' || results?.semanticState === 'failed' ? t('header.search.reducedCoverage') : results?.items.length === 0 ? t('header.search.noResults') : t('header.search.escapeHint')}
        </p>
        <ul className="mt-sm space-y-xs">
          {results?.items.map((result) => <li key={result.page.id}>
            <a href={getPageHref(result.page.path)} className="block rounded-md p-sm hover:bg-surface-elevated"
              onClick={() => {
                if (!searchRecordRef.current || !sessionRef.current || terminalEventRef.current) return;
                terminalEventRef.current = true;
                void fetch('/api/v1/search/pages', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'behavior', eventId: crypto.randomUUID(), searchRecordId: searchRecordRef.current, searchSessionId: sessionRef.current, action: 'result_open', pageId: result.page.id }) });
              }}>
              <span className="block font-medium">{result.page.title}</span>
              <span className="block text-xs text-muted">{result.page.path}</span>
              {result.excerpt && <span className="mt-1 block text-sm text-muted">{result.excerpt}</span>}
            </a>
          </li>)}
        </ul>
      </section>}
    </>
  );
}
