'use client';

import { useState } from 'react';
import type { FeishuConfigView } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Props = {
  initial: FeishuConfigView;
  callbackUrl: string;
};

export function FeishuIntegrationPanel({ initial, callbackUrl }: Props) {
  const [config, setConfig] = useState(initial);
  const [appId, setAppId] = useState(initial.appId ?? '');
  const [appSecret, setAppSecret] = useState('');
  const [encryptKey, setEncryptKey] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [userLimit, setUserLimit] = useState(String(initial.userRateLimitPerMinute));
  const [chatLimit, setChatLimit] = useState(String(initial.chatRateLimitPerMinute));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/admin/feishu', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          appId: appId || undefined,
          appSecret: appSecret || undefined,
          encryptKey: encryptKey || undefined,
          verificationToken: verificationToken || undefined,
          userRateLimitPerMinute: Number(userLimit),
          chatRateLimitPerMinute: Number(chatLimit),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? '无法保存飞书配置。');
        return;
      }
      setConfig(body as FeishuConfigView);
      setAppSecret('');
      setEncryptKey('');
      setVerificationToken('');
      setSaved(true);
    } catch {
      setError('无法连接到服务器，飞书配置未保存。');
    } finally {
      setSaving(false);
    }
  }

  const secretHint = (configured: boolean) =>
    configured ? '已配置；留空则保持不变，填写新值可轮换。' : '尚未配置。';

  return (
    <div className="max-w-3xl space-y-lg">
      <section className="rounded-lg border border-border bg-surface p-lg space-y-sm">
        <h2 className="font-display text-lg font-semibold">先在飞书开放平台创建应用</h2>
        <ol className="list-decimal space-y-xs pl-lg text-sm text-muted">
          <li>使用有权限的飞书管理员账号创建“企业自建应用”，并启用机器人能力。</li>
          <li>在应用的事件订阅中填写下方回调地址，并订阅接收消息事件。</li>
          <li>
            在开放平台复制 App ID、App Secret、Encrypt Key（及可选 Verification Token）到本页。
          </li>
          <li>发布或安装该应用到目标租户后，用户可在飞书中给机器人发消息完成账号绑定。</li>
        </ol>
        <p className="text-sm text-muted">
          扫码不能创建机器人；二维码仅可能出现在飞书侧的管理员安装或授权流程中。
        </p>
        <label className="block space-y-xs text-sm">
          <span className="font-medium">Event V2 回调地址</span>
          <Input value={callbackUrl} readOnly aria-label="Feishu Event V2 callback URL" />
        </label>
      </section>

      <section className="rounded-lg border border-border bg-surface p-lg space-y-md">
        <div className="flex items-center justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">连接配置</h2>
            <p className="text-sm text-muted">密钥仅写入加密存储，页面不会回显明文。</p>
          </div>
          <label className="flex items-center gap-sm text-sm font-medium">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) =>
                setConfig((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            启用飞书机器人
          </label>
        </div>

        <div className="grid gap-md sm:grid-cols-2">
          <label className="space-y-xs text-sm">
            <span className="block font-medium">App ID</span>
            <Input
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder="cli_xxx"
            />
          </label>
          <label className="space-y-xs text-sm">
            <span className="block font-medium">App Secret</span>
            <Input
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
            />
            <span className="block text-xs text-muted">{secretHint(config.hasAppSecret)}</span>
          </label>
          <label className="space-y-xs text-sm">
            <span className="block font-medium">Encrypt Key</span>
            <Input
              type="password"
              value={encryptKey}
              onChange={(event) => setEncryptKey(event.target.value)}
            />
            <span className="block text-xs text-muted">{secretHint(config.hasEncryptKey)}</span>
          </label>
          <label className="space-y-xs text-sm">
            <span className="block font-medium">Verification Token（可选）</span>
            <Input
              type="password"
              value={verificationToken}
              onChange={(event) => setVerificationToken(event.target.value)}
            />
            <span className="block text-xs text-muted">
              {secretHint(config.hasVerificationToken)}
            </span>
          </label>
          <label className="space-y-xs text-sm">
            <span className="block font-medium">每用户每分钟消息数</span>
            <Input
              type="number"
              min={1}
              max={600}
              value={userLimit}
              onChange={(event) => setUserLimit(event.target.value)}
            />
          </label>
          <label className="space-y-xs text-sm">
            <span className="block font-medium">每聊天每分钟消息数</span>
            <Input
              type="number"
              min={1}
              max={600}
              value={chatLimit}
              onChange={(event) => setChatLimit(event.target.value)}
            />
          </label>
        </div>
        {config.lastError && <Alert>最近错误：{config.lastError}</Alert>}
        {error && <Alert>{error}</Alert>}
        {saved && (
          <p className="rounded-md bg-primary/10 p-md text-sm text-primary">飞书配置已保存。</p>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? '正在保存…' : '保存飞书配置'}
        </Button>
      </section>
    </div>
  );
}
