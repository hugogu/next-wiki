import Link from 'next/link';
import type { RequestLogDetail as RequestLogDetailType } from '@next-wiki/shared';
import { getDictionary, getLocale } from '@/i18n/server';
import { RequestLogBodyViewer } from './RequestLogBodyViewer';

function Pretty({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface-elevated p-md text-xs">
      {value === null ? '' : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function HeaderList({ headers }: { headers: NonNullable<RequestLogDetailType['requestHeaders']> }) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
      {headers.map((header, index) => (
        <div key={`${header.name}-${index}`} className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-md px-md py-sm">
          <dt className="font-mono font-medium text-muted">{header.name}</dt>
          <dd className="min-w-0 break-words font-mono">{header.values.join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

export async function RequestLogDetail({ entry }: { entry: RequestLogDetailType }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const unavailable = <p className="text-sm text-muted">{t('admin.requestLog.unavailable')}</p>;
  return (
    <div className="space-y-lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/request-log" className="text-sm text-primary hover:underline">
          {t('admin.requestLog.back')}
        </Link>
      </nav>
      <header>
        <h1 className="font-display text-2xl font-semibold">{t('admin.requestLog.detail')}</h1>
        <p className="mt-xs font-mono text-sm text-muted">
          {entry.method} {entry.targetHost ?? ''}
          {entry.targetPath ?? ''} · {entry.statusCode ?? entry.outcome}
        </p>
      </header>
      {(entry.model || entry.inputTokens !== null || entry.outputTokens !== null || entry.cachedInputTokens !== null) && (
        <section className="rounded-lg border border-border bg-surface p-md">
          <h2 className="font-display text-lg font-semibold">{t('admin.requestLog.usage')}</h2>
          <dl className="mt-sm grid gap-sm text-sm sm:grid-cols-4">
            <div><dt className="text-muted">{t('admin.requestLog.model')}</dt><dd className="mt-xs font-mono">{entry.model ?? '—'}</dd></div>
            <div><dt className="text-muted">{t('admin.requestLog.inputTokens')}</dt><dd className="mt-xs">{entry.inputTokens ?? '—'}</dd></div>
            <div><dt className="text-muted">{t('admin.requestLog.outputTokens')}</dt><dd className="mt-xs">{entry.outputTokens ?? '—'}</dd></div>
            <div><dt className="text-muted">{t('admin.requestLog.cachedInputTokens')}</dt><dd className="mt-xs">{entry.cachedInputTokens ?? '—'}</dd></div>
          </dl>
        </section>
      )}
      <section className="grid gap-lg lg:grid-cols-2">
        <div className="space-y-md">
          <h2 className="font-display text-lg font-semibold">{t('admin.requestLog.request')}</h2>
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.headers')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.requestHeaders ? <HeaderList headers={entry.requestHeaders} /> : unavailable}
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.body')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.requestBody ? <RequestLogBodyViewer body={entry.requestBody} /> : unavailable}
        </div>
        <div className="space-y-md">
          <h2 className="font-display text-lg font-semibold">{t('admin.requestLog.response')}</h2>
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.headers')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.responseHeaders ? <HeaderList headers={entry.responseHeaders} /> : unavailable}
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.body')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.responseBody ? <RequestLogBodyViewer body={entry.responseBody} /> : unavailable}
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.error')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.errorDetail ? <Pretty value={entry.errorDetail} /> : unavailable}
        </div>
      </section>
    </div>
  );
}
