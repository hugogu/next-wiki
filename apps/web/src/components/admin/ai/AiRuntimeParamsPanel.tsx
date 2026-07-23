'use client';

import { useState } from 'react';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';

/**
 * Wiki AI tool-runtime parameters (026), edited from Bots > General. Persists to
 * `ai_settings`; the tool loop reads these on each turn.
 */
export function AiRuntimeParamsPanel({ initial }: { initial: AiRuntimeSettingsView }) {
  const { t } = useTranslation();
  const [maxCalls, setMaxCalls] = useState(String(initial.params.toolMaxCalls));
  const [temperature, setTemperature] = useState(String(initial.params.plannerTemperature));
  const [maxTokens, setMaxTokens] = useState(String(initial.params.plannerMaxOutputTokens));
  const [timeoutMs, setTimeoutMs] = useState(String(initial.params.plannerTimeoutMs));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/ai/runtime-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toolMaxCalls: Number(maxCalls),
          plannerTemperature: Number(temperature),
          plannerMaxOutputTokens: Number(maxTokens),
          plannerTimeoutMs: Number(timeoutMs),
        }),
      });
      if (!response.ok) throw new Error('save failed');
      setMessage({ kind: 'ok', text: t('admin.bots.general.runtime.saved') });
    } catch {
      setMessage({ kind: 'error', text: t('admin.bots.general.runtime.saveError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ai-runtime-params-heading" className="space-y-sm rounded-md border border-border p-md">
      <div>
        <h3 id="ai-runtime-params-heading" className="text-sm font-semibold">
          {t('admin.bots.general.runtime.title')}
        </h3>
        <p className="mt-xs text-sm text-muted">{t('admin.bots.general.runtime.description')}</p>
      </div>
      <div className="grid gap-md sm:grid-cols-2">
        <Field label={t('admin.bots.general.runtime.maxCalls')}>
          <Input type="number" min={1} max={100} value={maxCalls} onChange={(e) => setMaxCalls(e.target.value)} />
        </Field>
        <Field label={t('admin.bots.general.runtime.temperature')}>
          <Input type="number" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
        </Field>
        <Field label={t('admin.bots.general.runtime.maxOutputTokens')}>
          <Input type="number" min={256} max={65536} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
        </Field>
        <Field label={t('admin.bots.general.runtime.timeout')}>
          <Input type="number" min={5000} max={600000} step={1000} value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-sm">
        <Button type="button" variant="primary" disabled={busy} onClick={save}>
          {t('admin.bots.general.runtime.save')}
        </Button>
        {message ? (
          <span role="status" className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-xs text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
