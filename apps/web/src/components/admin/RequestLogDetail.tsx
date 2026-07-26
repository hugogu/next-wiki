import Link from 'next/link';
import type { RequestLogDetail as RequestLogDetailType } from '@next-wiki/shared';
import { getDictionary, getLocale } from '@/i18n/server';

function Pretty({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface-elevated p-md text-xs">
      {value === null ? '' : JSON.stringify(value, null, 2)}
    </pre>
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
      <section className="grid gap-lg lg:grid-cols-2">
        <div className="space-y-md">
          <h2 className="font-display text-lg font-semibold">{t('admin.requestLog.request')}</h2>
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.headers')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.requestHeaders ? <Pretty value={entry.requestHeaders} /> : unavailable}
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.body')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.requestBody ? <Pretty value={entry.requestBody} /> : unavailable}
        </div>
        <div className="space-y-md">
          <h2 className="font-display text-lg font-semibold">{t('admin.requestLog.response')}</h2>
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.headers')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.responseHeaders ? <Pretty value={entry.responseHeaders} /> : unavailable}
          <h3 className="text-sm font-medium">
            {t('admin.requestLog.body')}{' '}
            <span className="text-muted">({t('admin.requestLog.sensitive')})</span>
          </h3>
          {entry.responseBody ? <Pretty value={entry.responseBody} /> : unavailable}
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
