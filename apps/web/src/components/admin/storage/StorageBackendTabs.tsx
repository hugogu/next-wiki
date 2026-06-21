'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  StorageBackendType,
  StorageBackendView,
  StorageDeploymentInfo,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';
import { StorageBackendForm } from './StorageBackendForm';
import { GitExportPanel } from './GitExportPanel';
import { SettingsTabs } from '@/components/ui/SettingsTabs';

type TabType = Extract<StorageBackendType, 'database' | 'local' | 's3' | 'git'>;
type PrimaryTabType = Exclude<TabType, 'git'>;

const TABS: TabType[] = ['database', 'local', 's3', 'git'];
const TYPE_LABEL: Record<TabType, TranslationKey> = {
  database: 'admin.storage.type.database',
  local: 'admin.storage.type.local',
  s3: 'admin.storage.type.s3',
  git: 'admin.storage.type.git',
};

function parseTab(value: string | null): TabType {
  return TABS.includes(value as TabType) ? (value as TabType) : 'database';
}

function ControlRow({
  label,
  description,
  checked,
  disabled,
  ariaLabel,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-md border-t border-border py-sm first:border-t-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-xs text-xs text-muted">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={onChange}
      />
    </div>
  );
}

function BackendStatusCard({
  type,
  backend,
  preferred,
}: {
  type: PrimaryTabType;
  backend?: StorageBackendView;
  preferred: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = useApiMutation<{ syncExisting: boolean }, StorageBackendView>(
    `/api/storage/backends/${backend?.id ?? 'unconfigured'}/enable`,
  );
  const disable = useApiMutation<{ retainData: boolean }, StorageBackendView>(
    `/api/storage/backends/${backend?.id ?? 'unconfigured'}/disable`,
  );
  const prefer = useApiMutation<{ backendId: string | null }, StorageBackendView | null>(
    '/api/storage/read-backend',
    { method: 'PUT' },
  );

  const enabled =
    type === 'database' ||
    (backend !== undefined &&
      backend.replicaState !== 'disabled' &&
      backend.replicaState !== 'deleting');
  const pending = enable.isPending || disable.isPending || prefer.isPending;
  const state =
    type === 'database'
      ? 'enabled'
      : backend?.replicaState ?? 'disabled';

  useEffect(() => {
    if (backend?.replicaState !== 'backfilling' && backend?.replicaState !== 'deleting') return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [backend?.replicaState, router]);

  const runDisable = (retainData: boolean) => {
    if (!backend) return;
    setError(null);
    disable.mutate(
      { retainData },
      {
        onSuccess: () => {
          setConfirmDisable(false);
          router.refresh();
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  const runEnable = (syncExisting: boolean) => {
    if (!backend) return;
    setError(null);
    enable.mutate(
      { syncExisting },
      {
        onSuccess: () => {
          setConfirmEnable(false);
          if (syncExisting) {
            router.push(`/admin/storage/backends/${backend.id}/sync?tab=${type}`);
          } else {
            router.refresh();
          }
        },
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  const setPreferred = () => {
    setError(null);
    prefer.mutate(
      { backendId: type === 'database' || preferred ? null : backend?.id ?? null },
      {
        onSuccess: () => router.refresh(),
        onError: (e: ApiError) => setError(e.message),
      },
    );
  };

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="font-display text-lg font-semibold">{t(TYPE_LABEL[type])}</h2>
          <p className="mt-xs text-sm text-muted">
            {type === 'database'
              ? t('admin.storage.database.description')
              : t('admin.storage.replica.description')}
          </p>
        </div>
        <span
          className={`rounded-full px-sm py-xs text-xs font-medium ${
            enabled ? 'bg-success/10 text-success' : 'bg-surface text-muted'
          }`}
        >
          {t(`admin.storage.replica.state.${state}` as TranslationKey)}
        </span>
      </div>

      <div className="mt-md rounded-md border border-border px-sm">
        <ControlRow
          label={t('admin.storage.replica.enabledLabel')}
          description={
            type === 'database'
              ? t('admin.storage.replica.databaseAlwaysEnabled')
              : t('admin.storage.replica.enabledDescription')
          }
          checked={enabled}
          disabled={type === 'database' || pending || !backend}
          ariaLabel={t(
            type === 'database'
              ? 'admin.storage.replica.databaseToggle'
              : 'admin.storage.replica.enabledToggle',
          )}
          onChange={() => (enabled ? setConfirmDisable(true) : setConfirmEnable(true))}
        />
        <ControlRow
          label={t('admin.storage.replica.preferredLabel')}
          description={t('admin.storage.replica.preferredDescription')}
          checked={preferred}
          disabled={pending || !enabled || state === 'backfilling'}
          ariaLabel={t('admin.storage.replica.preferredToggle')}
          onChange={setPreferred}
        />
      </div>

      {backend?.lastSyncAt && (
        <p className="mt-sm text-xs text-muted">
          {t('admin.storage.replica.lastSync', {
            time: new Date(backend.lastSyncAt).toLocaleString(),
          })}
        </p>
      )}
      {backend?.lastError && <p className="mt-sm text-sm text-danger">{backend.lastError}</p>}
      {error && <p className="mt-sm text-sm text-danger">{error}</p>}

      {confirmEnable && backend && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-lg shadow-lg">
            <h3 className="font-display text-xl font-semibold">
              {t('admin.storage.replica.enableTitle')}
            </h3>
            <p className="mt-sm text-sm text-muted">
              {t('admin.storage.replica.enableMessage')}
            </p>
            <div className="mt-lg flex flex-wrap justify-end gap-sm">
              <Button variant="ghost" onClick={() => setConfirmEnable(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => runEnable(false)}
              >
                {t('admin.storage.replica.enableWithoutSync')}
              </Button>
              <Button disabled={pending} onClick={() => runEnable(true)}>
                {t('admin.storage.replica.enableAndSync')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDisable && backend && (
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
                variant="secondary"
                disabled={pending}
                onClick={() => runDisable(true)}
              >
                {t('admin.storage.replica.disableKeep')}
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => runDisable(false)}>
                {t('admin.storage.replica.disableDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function StorageBackendTabs({
  backends,
  gitExport,
  deployment,
}: {
  backends: StorageBackendView[];
  gitExport: StorageBackendView | null;
  deployment: StorageDeploymentInfo;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseTab(searchParams.get('tab'));
  const backend =
    selected === 'git' ? gitExport ?? undefined : backends.find((item) => item.type === selected);
  const preferredExternal = backends.find((item) => item.isReadPreferred);
  const preferred =
    selected === 'database'
      ? !preferredExternal
      : selected === 'git'
        ? false
        : backend?.isReadPreferred ?? false;

  const selectTab = (type: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', type);
    router.push(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (searchParams.get('tab')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'database');
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const tabs = TABS.map((type) => {
    const item = type === 'git' ? gitExport : backends.find((candidate) => candidate.type === type);
    return {
      id: type,
      label: t(TYPE_LABEL[type]),
      status:
        type === 'database'
          ? t('admin.storage.replica.state.enabled')
          : item
            ? t(`admin.storage.replica.state.${item.replicaState}` as TranslationKey)
            : t('admin.storage.replica.unconfigured'),
    };
  });

  return (
    <SettingsTabs tabs={tabs} selected={selected} onSelect={selectTab}>
        {selected === 'git' ? (
          <GitExportPanel initial={gitExport} />
        ) : (
          <>
            <BackendStatusCard type={selected} backend={backend} preferred={preferred} />

            {selected === 'database' ? (
              <section className="rounded-lg border border-border bg-surface-elevated p-md">
                <dl className="grid gap-sm text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.role')}</dt>
                    <dd>{t('admin.storage.replica.authoritative')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.engine')}</dt>
                    <dd>{deployment.database.engine}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.host')}</dt>
                    <dd>{deployment.database.host}:{deployment.database.port}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.name')}</dt>
                    <dd>{deployment.database.database}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.username')}</dt>
                    <dd>{deployment.database.username}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('admin.storage.database.ssl')}</dt>
                    <dd>
                      {deployment.database.ssl
                        ? t('admin.storage.database.sslEnabled')
                        : t('admin.storage.database.sslDisabled')}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : (
              <StorageBackendForm
                key={selected}
                type={selected}
                initial={backend}
                localDeployment={selected === 'local' ? deployment.local : undefined}
              />
            )}
          </>
        )}
    </SettingsTabs>
  );
}
