'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StorageBackendType, StorageBackendView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';
import { StorageBackendForm } from './StorageBackendForm';

type TabType = Extract<StorageBackendType, 'database' | 'local' | 's3'>;

const TABS: TabType[] = ['database', 'local', 's3'];
const TYPE_LABEL: Record<TabType, TranslationKey> = {
  database: 'admin.storage.type.database',
  local: 'admin.storage.type.local',
  s3: 'admin.storage.type.s3',
};

function ReplicaControls({ backend }: { backend: StorageBackendView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = useApiMutation<Record<string, never>, StorageBackendView>(
    `/api/storage/backends/${backend.id}/enable`,
  );
  const disable = useApiMutation<{ retainData: boolean }, StorageBackendView>(
    `/api/storage/backends/${backend.id}/disable`,
  );
  const prefer = useApiMutation<{ backendId: string | null }, StorageBackendView | null>(
    '/api/storage/read-backend',
    { method: 'PUT' },
  );

  const run = (
    mutation: typeof enable | typeof disable | typeof prefer,
    body: Record<string, unknown>,
    done?: () => void,
  ) => {
    setError(null);
    mutation.mutate(body as never, {
      onSuccess: () => {
        done?.();
        router.refresh();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const enabled = backend.replicaState !== 'disabled' && backend.replicaState !== 'deleting';
  const pending = enable.isPending || disable.isPending || prefer.isPending;

  useEffect(() => {
    if (backend.replicaState !== 'backfilling' && backend.replicaState !== 'deleting') return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [backend.replicaState, router]);

  return (
    <section className="mt-md rounded-lg border border-border bg-surface p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="font-display font-semibold">{t('admin.storage.replica.heading')}</h3>
          <p className="mt-xs text-sm text-muted">
            {t(`admin.storage.replica.state.${backend.replicaState}` as TranslationKey)}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={t('admin.storage.replica.enabledToggle')}
          aria-checked={enabled}
          disabled={pending}
          onClick={() =>
            enabled
              ? setConfirmDisable(true)
              : run(enable, {})
          }
          className={`relative h-7 w-12 rounded-full transition-colors ${
            enabled ? 'bg-primary' : 'bg-border'
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-md flex flex-wrap items-center gap-sm">
          <Button
            variant={backend.isReadPreferred ? 'primary' : 'ghost'}
            disabled={pending || backend.replicaState === 'backfilling'}
            onClick={() =>
              run(prefer, { backendId: backend.isReadPreferred ? null : backend.id })
            }
          >
            {backend.isReadPreferred
              ? t('admin.storage.replica.preferred')
              : t('admin.storage.replica.makePreferred')}
          </Button>
          {backend.lastSyncAt && (
            <span className="text-xs text-muted">
              {t('admin.storage.replica.lastSync', {
                time: new Date(backend.lastSyncAt).toLocaleString(),
              })}
            </span>
          )}
        </div>
      )}

      {backend.lastError && <p className="mt-sm text-sm text-danger">{backend.lastError}</p>}
      {error && <p className="mt-sm text-sm text-danger">{error}</p>}

      {confirmDisable && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-lg shadow-lg">
            <h3 className="font-display text-xl font-semibold">
              {t('admin.storage.replica.disableTitle')}
            </h3>
            <p className="mt-sm text-sm text-muted">
              {t('admin.storage.replica.disableMessage')}
            </p>
            <div className="mt-lg flex flex-wrap justify-end gap-sm">
              <Button variant="ghost" onClick={() => setConfirmDisable(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(disable, { retainData: true }, () => setConfirmDisable(false))}
              >
                {t('admin.storage.replica.disableKeep')}
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => run(disable, { retainData: false }, () => setConfirmDisable(false))}
              >
                {t('admin.storage.replica.disableDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function StorageBackendTabs({ backends }: { backends: StorageBackendView[] }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<TabType>('database');
  const backend = backends.find((item) => item.type === selected);

  return (
    <div className="grid gap-md md:grid-cols-[14rem_minmax(0,1fr)]">
      <div role="tablist" aria-orientation="vertical" className="space-y-xs">
        {TABS.map((type) => {
          const item = backends.find((candidate) => candidate.type === type);
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={selected === type}
              onClick={() => setSelected(type)}
              className={`flex w-full items-center justify-between rounded-md px-md py-sm text-left ${
                selected === type ? 'bg-primary text-primary-text' : 'hover:bg-surface-elevated'
              }`}
            >
              <span>{t(TYPE_LABEL[type])}</span>
              <span className="text-xs">
                {type === 'database'
                  ? t('admin.storage.replica.authoritative')
                  : item
                    ? t(`admin.storage.replica.state.${item.replicaState}` as TranslationKey)
                    : t('admin.storage.replica.unconfigured')}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {selected === 'database' ? (
          <section className="rounded-lg border border-border bg-surface-elevated p-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {t('admin.storage.type.database')}
                </h2>
                <p className="mt-xs text-sm text-muted">
                  {t('admin.storage.database.description')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={t('admin.storage.replica.databaseToggle')}
                aria-checked="true"
                disabled
                className="relative h-7 w-12 rounded-full bg-primary opacity-70"
              >
                <span className="absolute top-1 translate-x-6 h-5 w-5 rounded-full bg-white" />
              </button>
            </div>
            <dl className="mt-md grid gap-sm text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t('admin.storage.database.role')}</dt>
                <dd>{t('admin.storage.replica.authoritative')}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('admin.storage.active.statusLabel')}</dt>
                <dd>{t('admin.storage.replica.state.enabled')}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <>
            <StorageBackendForm type={selected} initial={backend} />
            {backend && <ReplicaControls backend={backend} />}
          </>
        )}
      </div>
    </div>
  );
}
