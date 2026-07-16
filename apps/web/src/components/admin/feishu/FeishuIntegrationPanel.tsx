'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { FeishuConfigView } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

type Registration = {
  registrationId: string;
  qrUrl: string;
  expiresAt: string;
  pollIntervalSeconds: number;
};

export function FeishuIntegrationPanel({ initial }: { initial: FeishuConfigView }) {
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
        setMessage('飞书应用已关联，正在建立 WebSocket 长连接。');
      } else {
        setMessage(body?.message ?? '二维码已失效或关联被取消，请重新生成。');
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
  }, [registration]);

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
      setMessage(error instanceof Error && error.message ? error.message : '无法生成飞书二维码。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-lg">
      <section className="rounded-lg border border-border bg-surface p-lg space-y-md">
        <div>
          <h2 className="font-display text-lg font-semibold">扫码接入飞书</h2>
          <p className="text-sm text-muted">
            用飞书 App 扫一扫，一步即可让本 Wiki 上线到你的飞书。接入后即可在飞书里与 Wiki 对话，
            全程无需填写任何密钥或地址。
          </p>
        </div>
        <Button onClick={start} disabled={loading || Boolean(registration)}>
          {loading ? '正在生成二维码…' : config.enabled ? '重新关联飞书应用' : '生成飞书二维码'}
        </Button>
        {registration && (
          <div className="space-y-sm rounded-md border border-border bg-background p-md">
            {qrDataUrl && (
              <Image
                src={qrDataUrl}
                alt="用飞书 App 扫描以关联或创建机器人"
                width={280}
                height={280}
                unoptimized
              />
            )}
            <p className="text-sm text-muted">
              二维码将在 {new Date(registration.expiresAt).toLocaleTimeString()} 失效。
            </p>
          </div>
        )}
        {message && <Alert>{message}</Alert>}
      </section>
      <section className="rounded-lg border border-border bg-surface p-lg space-y-xs text-sm">
        <h2 className="font-display text-lg font-semibold">连接状态</h2>
        <p>传输方式：WebSocket 长连接</p>
        <p>应用：{config.appId ?? '尚未关联'}</p>
        <p>状态：{config.enabled ? '已启用' : '未启用'}</p>
        {config.lastConnectedAt && (
          <p>最近连接：{new Date(config.lastConnectedAt).toLocaleString()}</p>
        )}
        {config.lastError && <Alert>最近错误：{config.lastError}</Alert>}
      </section>
    </div>
  );
}
