'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { FeishuConfigView } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

type Registration = {
  registrationId: string;
  qrUrl: string;
  expiresAt: string;
  pollIntervalSeconds: number;
};

export function FeishuIntegrationPanel({ initial }: { initial: FeishuConfigView }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState(initial);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!registration) return;
    let active = true;
    void import('qrcode')
      .then(({ toDataURL }) => toDataURL(registration.qrUrl, { margin: 1, width: 280 }))
      .then((url) => active && setQrDataUrl(url));
    return () => {
      active = false;
    };
  }, [registration]);

  useEffect(() => {
    if (!registration) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const response = await fetch(`/api/admin/feishu/registration/${registration.registrationId}`);
      const body = await response.json().catch(() => null);
      if (!active) return;
      if (response.ok && body?.status === 'pending') {
        timer = setTimeout(poll, registration.pollIntervalSeconds * 1000);
        return;
      }
      setRegistration(null);
      if (response.ok && body?.status === 'completed') {
        setConfig((current) => ({
          ...current,
          enabled: true,
          appId: body.appId,
          hasAppSecret: true,
        }));
        setMessage(t('admin.feishu.connect.linked'));
      } else {
        setMessage(body?.message ?? t('admin.feishu.connect.expired'));
      }
    };
    timer = setTimeout(
      () => void poll().catch(() => undefined),
      registration.pollIntervalSeconds * 1000,
    );
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [registration, t]);

  async function start() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/feishu/registration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'feishu' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message);
      setQrDataUrl(null);
      setRegistration(body as Registration);
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : t('admin.feishu.connect.generateFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-lg">
      <section className="rounded-lg border border-border bg-surface p-lg space-y-md">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('admin.feishu.connect.title')}</h2>
          <p className="text-sm text-muted">{t('admin.feishu.connect.description')}</p>
        </div>
        <Button onClick={start} disabled={loading || Boolean(registration)}>
          {loading
            ? t('admin.feishu.connect.generating')
            : config.enabled
              ? t('admin.feishu.connect.regenerate')
              : t('admin.feishu.connect.generate')}
        </Button>
        {registration && (
          <div className="space-y-sm rounded-md border border-border bg-background p-md">
            {qrDataUrl && (
              <Image
                src={qrDataUrl}
                alt={t('admin.feishu.connect.qrAlt')}
                width={280}
                height={280}
                unoptimized
              />
            )}
            <p className="text-sm text-muted">
              {t('admin.feishu.connect.expiresAt', {
                time: new Date(registration.expiresAt).toLocaleTimeString(),
              })}
            </p>
          </div>
        )}
        {message && <Alert>{message}</Alert>}
      </section>
      <section className="rounded-lg border border-border bg-surface p-lg space-y-xs text-sm">
        <h2 className="font-display text-lg font-semibold">{t('admin.feishu.status.title')}</h2>
        <p>{t('admin.feishu.status.transport')}</p>
        <p>{t('admin.feishu.status.app', { value: config.appId ?? t('admin.feishu.status.notLinked') })}</p>
        <p>
          {t('admin.feishu.status.state', {
            value: config.enabled ? t('admin.feishu.status.enabled') : t('admin.feishu.status.disabled'),
          })}
        </p>
        {config.lastConnectedAt && (
          <p>{t('admin.feishu.status.lastConnected', { time: new Date(config.lastConnectedAt).toLocaleString() })}</p>
        )}
        {config.lastError && <Alert>{t('admin.feishu.status.lastError', { message: config.lastError })}</Alert>}
      </section>
    </div>
  );
}
