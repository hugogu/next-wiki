'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export type WebResearchSettingsView = {
  enabled: boolean;
  provider: 'tavily' | null;
  credentialConfigured: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  limits: { maxSearchesPerTurn: number; maxCandidatesPerSearch: number; maxOpenedSourcesPerTurn: number; maxSourceChars: number; timeoutMs: number };
  lastConnectionTest: { status: string | null; completedAt: string } | null;
};

type WebResearchConnectionTestResult = {
  ok: boolean;
  status: string;
  latencyMs: number;
  candidateCount?: number;
  errorCode?: string;
  errorMessage?: string;
  testedAt: string;
};

function domains(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function WebResearchPanel({ initial }: { initial: WebResearchSettingsView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [settings, setSettings] = useState<WebResearchSettingsView>(initial);
  const [apiKey, setApiKey] = useState('');
  const [allowedDomains, setAllowedDomains] = useState(initial.allowedDomains.join(', '));
  const [blockedDomains, setBlockedDomains] = useState(initial.blockedDomains.join(', '));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (nextEnabled = settings.enabled) => {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/ai/web-research/settings', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, provider: 'tavily', ...(apiKey ? { apiKey } : {}), allowedDomains: domains(allowedDomains), blockedDomains: domains(blockedDomains), limits: settings.limits }),
    });
    if (response.ok) {
      setSettings(await response.json() as WebResearchSettingsView);
      setApiKey('');
      setMessage(t('admin.ai.webResearch.saved'));
      router.refresh();
    } else {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      setMessage(body?.message ?? t('admin.ai.webResearch.saveError'));
    }
    setSaving(false);
  };

  const test = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/ai/web-research/connection-tests', { method: 'POST' });
      const result = await response.json().catch(() => null) as WebResearchConnectionTestResult | { message?: string } | null;
      if (!response.ok) {
        setMessage((result && 'message' in result ? result.message : undefined) ?? t('admin.ai.webResearch.saveError'));
        return;
      }
      const health = result as WebResearchConnectionTestResult;
      setSettings((current) => ({
        ...current,
        lastConnectionTest: { status: health.status, completedAt: health.testedAt },
      }));
      setMessage(
        health.ok
          ? t('admin.ai.webResearch.testOk', {
              latency: health.latencyMs,
              candidates: health.candidateCount ?? 0,
            })
          : t('admin.ai.webResearch.testFailed', {
              detail: health.errorMessage ?? health.errorCode ?? health.status,
            }),
      );
    } catch {
      setMessage(t('admin.ai.webResearch.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const setLimit = (key: keyof WebResearchSettingsView['limits'], value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    setSettings((current) => ({ ...current, limits: { ...current.limits, [key]: parsed } }));
  };

  return (
    <section className="space-y-md">
      <div><h2 className="font-display text-lg font-semibold">{t('admin.ai.webResearch.title')}</h2><p className="mt-xs text-sm text-muted">{t('admin.ai.webResearch.description')}</p></div>
      <form className="space-y-md rounded-lg border border-border bg-surface p-md" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="flex items-start justify-between gap-md"><span><span className="block text-sm font-medium">{t('admin.ai.webResearch.enabled')}</span><span className="block text-xs text-muted">{t('admin.ai.webResearch.enabledHint')}</span></span><Switch checked={settings.enabled} disabled={saving} onClick={() => { void save(!settings.enabled); }} /></label>
        <label className="block space-y-xs"><span className="text-sm font-medium">{t('admin.ai.webResearch.apiKey')}</span><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.credentialConfigured ? t('admin.ai.webResearch.replaceKey') : ''} /><span className="block text-xs text-muted">{t('admin.ai.webResearch.apiKeyHint')}</span></label>
        <label className="block space-y-xs"><span className="text-sm font-medium">{t('admin.ai.webResearch.allowedDomains')}</span><Input value={allowedDomains} onChange={(event) => setAllowedDomains(event.target.value)} placeholder="docs.example.com, example.org" /></label>
        <label className="block space-y-xs"><span className="text-sm font-medium">{t('admin.ai.webResearch.blockedDomains')}</span><Input value={blockedDomains} onChange={(event) => setBlockedDomains(event.target.value)} placeholder="private.example.com" /></label>
        <fieldset className="grid gap-sm rounded-md border border-border p-sm md:grid-cols-2">
          <legend className="px-xs text-sm font-medium">{t('admin.ai.webResearch.limits')}</legend>
          <label className="space-y-xs text-sm"><span>{t('admin.ai.webResearch.maxSearches')}</span><Input type="number" min={1} max={5} value={settings.limits.maxSearchesPerTurn} onChange={(event) => setLimit('maxSearchesPerTurn', event.target.value)} /></label>
          <label className="space-y-xs text-sm"><span>{t('admin.ai.webResearch.maxCandidates')}</span><Input type="number" min={1} max={10} value={settings.limits.maxCandidatesPerSearch} onChange={(event) => setLimit('maxCandidatesPerSearch', event.target.value)} /></label>
          <label className="space-y-xs text-sm"><span>{t('admin.ai.webResearch.maxSources')}</span><Input type="number" min={1} max={5} value={settings.limits.maxOpenedSourcesPerTurn} onChange={(event) => setLimit('maxOpenedSourcesPerTurn', event.target.value)} /></label>
          <label className="space-y-xs text-sm"><span>{t('admin.ai.webResearch.maxChars')}</span><Input type="number" min={1000} max={64000} value={settings.limits.maxSourceChars} onChange={(event) => setLimit('maxSourceChars', event.target.value)} /></label>
          <label className="space-y-xs text-sm"><span>{t('admin.ai.webResearch.timeout')}</span><Input type="number" min={1000} max={60000} value={settings.limits.timeoutMs} onChange={(event) => setLimit('timeoutMs', event.target.value)} /></label>
        </fieldset>
        {settings.lastConnectionTest && <p className="text-xs text-muted">{t('admin.ai.webResearch.lastTest', { status: settings.lastConnectionTest.status ?? 'unknown' })}</p>}
        <p className="text-xs text-muted">{t('admin.ai.webResearch.privacyNotice')}</p>
        <div className="flex items-center justify-between gap-sm"><p className="text-sm text-muted">{message}</p><div className="flex gap-sm"><Button type="button" variant="secondary" disabled={saving || !settings.credentialConfigured} onClick={() => { void test(); }}>{t('admin.ai.webResearch.test')}</Button><Button type="submit" disabled={saving}>{t('admin.ai.webResearch.save')}</Button></div></div>
      </form>
    </section>
  );
}
