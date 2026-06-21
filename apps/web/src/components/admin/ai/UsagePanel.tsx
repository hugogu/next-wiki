'use client';

import { useEffect, useState } from 'react';
import type { AiUsageStatsView } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const CATEGORIES: Array<{ key: keyof AiUsageStatsView; label: TranslationKey }> = [
  { key: 'chat', label: 'admin.ai.usage.chat' },
  { key: 'embedding', label: 'admin.ai.usage.embedding' },
  { key: 'image', label: 'admin.ai.usage.image' },
];

const METRICS: Array<{ key: keyof AiUsageStatsView['chat']; label: TranslationKey }> = [
  { key: 'requests', label: 'admin.ai.usage.requests' },
  { key: 'inputTokens', label: 'admin.ai.actions.inputTokens' },
  { key: 'outputTokens', label: 'admin.ai.actions.outputTokens' },
  { key: 'cachedInputTokens', label: 'admin.ai.actions.cachedInputTokens' },
];

export function UsagePanel() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AiUsageStatsView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<AiUsageStatsView>('/api/ai/usage')
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.usage.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.usage.description')}</p>
      </div>
      {loading ? (
        <p className="text-sm text-muted">{t('admin.ai.usage.loading')}</p>
      ) : (
        <div className="grid gap-md sm:grid-cols-3">
          {CATEGORIES.map(({ key, label }) => {
            const bucket = stats?.[key];
            return (
              <div key={key} className="space-y-sm rounded-lg border border-border bg-surface p-md">
                <h3 className="font-medium">{t(label)}</h3>
                <dl className="space-y-xs text-sm">
                  {METRICS.map((metric) => (
                    <div key={metric.key} className="flex items-center justify-between">
                      <dt className="text-muted">{t(metric.label)}</dt>
                      <dd className="font-medium tabular-nums">{(bucket?.[metric.key] ?? 0).toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
