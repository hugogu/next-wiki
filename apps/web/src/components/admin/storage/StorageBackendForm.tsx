'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BackendCheckResult,
  StorageBackendType,
  StorageBackendView,
} from '@next-wiki/shared';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

type ConfigurableType = Extract<StorageBackendType, 'local' | 's3'>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-xs block text-muted">{label}</span>
      {children}
    </label>
  );
}

export function StorageBackendForm({
  type,
  initial,
}: {
  type: ConfigurableType;
  initial?: StorageBackendView;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const cfg = (initial?.config ?? {}) as Record<string, string | undefined>;
  const [basePath, setBasePath] = useState(cfg.basePath ?? '');
  const [endpoint, setEndpoint] = useState(cfg.endpoint ?? '');
  const [region, setRegion] = useState(cfg.region ?? '');
  const [bucket, setBucket] = useState(cfg.bucket ?? '');
  const [prefix, setPrefix] = useState(cfg.prefix ?? '');
  const [accessKeyId, setAccessKeyId] = useState(cfg.accessKeyId ?? '');
  const [secret, setSecret] = useState('');

  const [testResult, setTestResult] = useState<BackendCheckResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildConfig = (): Record<string, unknown> =>
    type === 'local'
      ? { basePath }
      : {
          endpoint: endpoint || undefined,
          region,
          bucket,
          prefix: prefix || undefined,
          accessKeyId,
        };

  const buildBody = () => ({ type, config: buildConfig(), secret: secret || undefined });

  const check = useApiMutation<ReturnType<typeof buildBody>, BackendCheckResult>(
    '/api/storage/backend-checks',
    { method: 'POST' },
  );
  const save = useApiMutation<ReturnType<typeof buildBody>, StorageBackendView>('/api/storage', {
    method: 'PUT',
  });

  const onTest = () => {
    setError(null);
    setTestResult(null);
    check.mutate(buildBody(), {
      onSuccess: (res) => setTestResult(res),
      onError: (e: ApiError) => setError(e.message),
    });
  };

  const onSave = () => {
    setError(null);
    setSaved(false);
    save.mutate(buildBody(), {
      onSuccess: () => {
        setSaved(true);
        setSecret('');
        router.refresh();
      },
      onError: (e: ApiError) => setError(e.message),
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface-elevated p-md">
      <h3 className="font-display font-semibold">
        {t(type === 'local' ? 'admin.storage.form.local.title' : 'admin.storage.form.s3.title')}
      </h3>

      <div className="mt-sm space-y-sm">
        {type === 'local' ? (
          <Field label={t('admin.storage.form.local.basePath')}>
            <Input value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="/data/content" />
          </Field>
        ) : (
          <>
            <Field label={t('admin.storage.form.s3.endpoint')}>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://s3.example.com" />
            </Field>
            <Field label={t('admin.storage.form.s3.region')}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" />
            </Field>
            <Field label={t('admin.storage.form.s3.bucket')}>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="wiki-content" />
            </Field>
            <Field label={t('admin.storage.form.s3.prefix')}>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="prod" />
            </Field>
            <Field label={t('admin.storage.form.s3.accessKeyId')}>
              <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
            </Field>
            <Field label={t('admin.storage.form.s3.secret')}>
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  initial?.hasSecret
                    ? t('admin.storage.form.s3.secretConfigured')
                    : t('admin.storage.form.s3.secretPlaceholder')
                }
              />
            </Field>
          </>
        )}
      </div>

      <div className="mt-md flex items-center gap-sm">
        <Button variant="ghost" onClick={onTest} disabled={check.isPending}>
          {check.isPending ? t('admin.storage.actions.testing') : t('admin.storage.actions.test')}
        </Button>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? t('admin.storage.actions.saving') : t('admin.storage.actions.save')}
        </Button>
      </div>

      {testResult && (
        <p className={`mt-sm text-sm ${testResult.ok ? 'text-success' : 'text-danger'}`} role="status">
          {testResult.ok
            ? t('admin.storage.result.ok')
            : t('admin.storage.result.failed', { detail: testResult.detail ?? '' })}
        </p>
      )}
      {saved && (
        <p className="mt-sm text-sm text-success" role="status">
          {t('admin.storage.saved')}
        </p>
      )}
      {error && (
        <p className="mt-sm text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <p className="mt-sm text-xs text-muted">{t('admin.storage.note.activation')}</p>
    </section>
  );
}
