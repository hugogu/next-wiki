'use client';

import { useState } from 'react';
import type { AiActionAccepted, AiSearchResult } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';
import { getSpaceHref, readerSpaceFromSlug } from '@/lib/path';

export function SemanticSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AiSearchResult[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const run = async () => {
    setStatus(t('ai.search.searching'));
    const response = await fetch('/api/ai/searches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, limit: 50 }) });
    if (!response.ok) {
      setStatus((await response.json()).message ?? t('ai.search.error'));
      return;
    }
    const action = await response.json() as AiActionAccepted;
    const stream = new EventSource(action.eventsUrl);
    stream.addEventListener('search_results', (event) => {
      setResults((JSON.parse((event as MessageEvent).data) as { results: AiSearchResult[] }).results);
      setPage(1);
    });
    const close = () => { stream.close(); setStatus(''); };
    stream.addEventListener('completed', close);
    stream.addEventListener('error', close);
    window.history.replaceState(null, '', `/search?q=${encodeURIComponent(query)}&mode=semantic&page=1`);
  };
  return (
    <div className="space-y-md">
      <form className="flex gap-sm" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ai.search.placeholder')} />
        <Button type="submit" disabled={!query.trim()}>{t('common.actions.search')}</Button>
      </form>
      {status && <p className="text-sm text-muted">{status}</p>}
      <div className="space-y-sm">
        {results.slice((page - 1) * pageSize, page * pageSize).map((result) => (
          <a key={result.pageId} href={getSpaceHref(readerSpaceFromSlug(result.spaceSlug), result.path)} className="block rounded-lg border border-border bg-surface p-md hover:bg-surface-elevated">
            <div className="flex items-center justify-between gap-md">
              <h2 className="font-medium">{result.title}</h2>
              <span className="flex shrink-0 items-center gap-xs">
                {result.rawCategorySystemKey === 'conversation' && (
                  <span className="rounded-full border border-border bg-surface-elevated px-xs py-0.5 text-[11px] leading-tight text-muted">
                    {t('header.search.source.conversation')}
                  </span>
                )}
                <span className="text-xs text-muted">{result.score.toFixed(3)}</span>
              </span>
            </div>
            <p className="mt-xs text-sm text-muted">{result.excerpt}</p>
          </a>
        ))}
      </div>
      {results.length > pageSize && <div className="flex items-center justify-between">
        <Button variant="secondary" disabled={page === 1} onClick={() => {
          const next = page - 1; setPage(next);
          const url = new URL(window.location.href); url.searchParams.set('page', String(next)); window.history.replaceState(null, '', url);
        }}>Previous</Button>
        <span className="text-sm text-muted">{page} / {Math.ceil(results.length / pageSize)}</span>
        <Button variant="secondary" disabled={page * pageSize >= results.length} onClick={() => {
          const next = page + 1; setPage(next);
          const url = new URL(window.location.href); url.searchParams.set('page', String(next)); window.history.replaceState(null, '', url);
        }}>Next</Button>
      </div>}
    </div>
  );
}
