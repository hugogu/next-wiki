'use client';

import type { StorageOverview, StorageBackendType } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const TYPE_LABEL: Record<StorageBackendType, TranslationKey> = {
  database: 'admin.storage.type.database',
  local: 'admin.storage.type.local',
  s3: 'admin.storage.type.s3',
  git: 'admin.storage.type.git',
};

export function StorageBackendSummary({ overview }: { overview: StorageOverview }) {
  const { t } = useTranslation();
  const { active } = overview;

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <h2 className="font-display font-semibold text-lg">{t('admin.storage.active.heading')}</h2>
      <dl className="mt-sm grid grid-cols-[auto_1fr] gap-x-md gap-y-xs text-sm">
        <dt className="text-muted">{t('admin.storage.active.typeLabel')}</dt>
        <dd className="font-medium">{t(TYPE_LABEL[active.type])}</dd>
        <dt className="text-muted">{t('admin.storage.active.statusLabel')}</dt>
        <dd>
          <span className="inline-flex items-center rounded-full bg-success-subtle px-sm py-0.5 text-xs text-success">
            {t('admin.storage.active.status.active')}
          </span>
        </dd>
      </dl>
      {overview.migration && (
        <p className="mt-sm text-sm text-muted" role="status">
          {t('admin.storage.active.migrating')}
        </p>
      )}
    </section>
  );
}
