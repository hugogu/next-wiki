'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentDataSourceItem } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/Switch';
import { apiGet, apiPatch, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const QUERY_KEY = ['content-data-sources'];

/** UI copy for each registered source is localized client-side (like other
 * settings panels) rather than trusting the server's English label/description,
 * which exist mainly for API/MCP consumers. Unregistered future keys fall back
 * to the server-provided strings so the panel never renders blank. */
const SOURCE_COPY: Record<string, { labelKey: TranslationKey; descriptionKey: TranslationKey }> = {
  'ai-conversations': {
    labelKey: 'admin.contentDataSources.sources.aiConversations.label',
    descriptionKey: 'admin.contentDataSources.sources.aiConversations.description',
  },
};

export function ContentDataSourcesPanel({ initial }: { initial: ContentDataSourceItem[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data: items = initial } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiGet<{ items: ContentDataSourceItem[] }>('/api/settings/content-data-sources').then((r) => r.items),
    initialData: initial,
  });

  async function toggle(item: ContentDataSourceItem) {
    setError(null);
    setPendingKey(item.sourceKey);
    try {
      await apiPatch(`/api/settings/content-data-sources/${item.sourceKey}`, { enabled: !item.enabled });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (e) {
      const apiError = e as ApiError;
      setError(
        apiError.code === 'DATA_SOURCE_UNAVAILABLE'
          ? t('admin.contentDataSources.error.unavailable')
          : (apiError.message ?? String(e)),
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="max-w-3xl space-y-md">
      <header>
        <h2 className="font-display text-lg font-semibold">{t('admin.contentDataSources.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.contentDataSources.description')}</p>
      </header>

      {error && <Alert>{error}</Alert>}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map((item) => {
          const copy = SOURCE_COPY[item.sourceKey];
          const label = copy ? t(copy.labelKey) : item.label;
          const description = copy ? t(copy.descriptionKey) : item.description;
          return (
            <li key={item.sourceKey} className="flex items-start justify-between gap-md p-md">
              <div>
                <div className="flex items-center gap-sm">
                  <span className="font-medium">{label}</span>
                  {!item.available && (
                    <StatusBadge tone="neutral">{t('admin.contentDataSources.unavailable')}</StatusBadge>
                  )}
                </div>
                <p className="mt-xs text-sm text-muted">{description}</p>
                {!item.available && (
                  <p className="mt-xs text-xs text-muted">{t('admin.contentDataSources.unavailableReason')}</p>
                )}
              </div>
              <Switch
                checked={item.enabled}
                disabled={pendingKey === item.sourceKey || (!item.available && !item.enabled)}
                aria-label={label}
                onClick={() => void toggle(item)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
