'use client';

import { useEffect, useState } from 'react';
import type { AdminPageStats } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-md py-sm">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="mt-xs text-2xl font-semibold text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

function StatSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-md py-sm">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <div className="mt-xs h-8 w-16 animate-pulse rounded bg-surface-elevated" />
    </div>
  );
}

export function AdminPageStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminPageStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/pages/stats')
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as AdminPageStats;
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || stats === null) {
    return (
      <div className="grid gap-sm sm:grid-cols-3">
        <StatSkeleton label={t('admin.pages.stats.totalPages')} />
        <StatSkeleton label={t('admin.pages.stats.totalEdits')} />
        <StatSkeleton label={t('admin.pages.stats.totalLinks')} />
      </div>
    );
  }

  return (
    <div className="grid gap-sm sm:grid-cols-3">
      <StatCard label={t('admin.pages.stats.totalPages')} value={stats.totalPages} />
      <StatCard label={t('admin.pages.stats.totalEdits')} value={stats.totalEdits} />
      <StatCard label={t('admin.pages.stats.totalLinks')} value={stats.totalPageLinks} />
    </div>
  );
}
