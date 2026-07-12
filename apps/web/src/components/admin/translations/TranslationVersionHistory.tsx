'use client';

import { useEffect, useState } from 'react';
import type { TranslationVersionView } from '@next-wiki/shared';
import { apiGet, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

/**
 * Immutable provenance/history for a translated document: each generated
 * revision with its source revision, model, prompt version, run/item, usage
 * provenance, and duration (T052).
 */
export function TranslationVersionHistory({ translationPageId }: { translationPageId: string }) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<TranslationVersionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<{ items: TranslationVersionView[] }>(
      `/api/translations/documents/${translationPageId}/versions`,
    )
      .then((data) => {
        if (active) setVersions(data.items);
      })
      .catch((e: ApiError) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [translationPageId]);

  if (error) return <p className="p-sm text-sm text-danger">{error}</p>;
  if (!versions) return <p className="p-sm text-sm text-muted">{t('common.status.loading')}</p>;
  if (versions.length === 0) return <p className="p-sm text-sm text-muted">{t('translation.run.empty')}</p>;

  return (
    <table className="w-full text-left text-xs">
      <thead className="text-muted">
        <tr>
          <th className="py-xs pr-sm">{t('translation.style.version', { n: '#' })}</th>
          <th className="py-xs pr-sm">{t('translation.run.model')}</th>
          <th className="py-xs pr-sm">{t('translation.usage.reported')}</th>
          <th className="py-xs pr-sm">{t('translation.usage.duration')}</th>
          <th className="py-xs pr-sm">{t('admin.transfers.table.started')}</th>
        </tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.revisionId} className="border-t border-border">
            <td className="py-xs pr-sm font-mono">v{v.versionNumber}</td>
            <td className="py-xs pr-sm">{v.modelName ?? '—'}</td>
            <td className="py-xs pr-sm">
              {v.usage.source === 'unavailable'
                ? t('translation.usage.unavailable')
                : `${v.usage.inputTokens ?? 0} / ${v.usage.outputTokens ?? 0}`}
            </td>
            <td className="py-xs pr-sm">{v.durationMs != null ? `${Math.round(v.durationMs / 1000)}s` : '—'}</td>
            <td className="py-xs pr-sm">{new Date(v.generatedAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
