'use client';

import { useState } from 'react';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

/**
 * Wiki AI runtime prompts (026), edited from AI > Prompts. An empty field clears
 * the override and restores the built-in default (shown as the placeholder). The
 * live tool catalog and the tool-call protocol are injected by the runtime, so
 * the tool prompt keeps its `{{TOOLS}}` marker.
 */
export function AiPromptsPanel({ initial }: { initial: AiRuntimeSettingsView }) {
  const { t } = useTranslation();
  const [assistant, setAssistant] = useState(initial.prompts.assistantSystemPrompt ?? '');
  const [tool, setTool] = useState(initial.prompts.toolSystemPrompt ?? '');
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
          // Blank clears the override server-side (restores the default).
          assistantSystemPrompt: assistant,
          toolSystemPrompt: tool,
        }),
      });
      if (!response.ok) throw new Error('save failed');
      setMessage({ kind: 'ok', text: t('admin.ai.prompts.saved') });
    } catch {
      setMessage({ kind: 'error', text: t('admin.ai.prompts.saveError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-lg">
      <PromptField
        label={t('admin.ai.prompts.assistant.label')}
        hint={t('admin.ai.prompts.assistant.help')}
        value={assistant}
        placeholder={initial.defaults.assistantSystemPrompt}
        usingDefault={assistant.trim() === ''}
        usingDefaultLabel={t('admin.ai.prompts.usingDefault')}
        resetLabel={t('admin.ai.prompts.reset')}
        onChange={setAssistant}
        onReset={() => setAssistant('')}
      />
      <PromptField
        label={t('admin.ai.prompts.tool.label')}
        hint={t('admin.ai.prompts.tool.help')}
        value={tool}
        placeholder={initial.defaults.toolSystemPrompt}
        usingDefault={tool.trim() === ''}
        usingDefaultLabel={t('admin.ai.prompts.usingDefault')}
        resetLabel={t('admin.ai.prompts.reset')}
        onChange={setTool}
        onReset={() => setTool('')}
      />
      <div className="flex items-center gap-sm">
        <Button type="button" variant="primary" disabled={busy} onClick={save}>
          {t('admin.ai.prompts.save')}
        </Button>
        {message ? (
          <span role="status" className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PromptField({
  label,
  hint,
  value,
  placeholder,
  usingDefault,
  usingDefaultLabel,
  resetLabel,
  onChange,
  onReset,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  usingDefault: boolean;
  usingDefaultLabel: string;
  resetLabel: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="space-y-xs">
      <div className="flex items-center justify-between gap-sm">
        <label className="text-sm font-semibold">{label}</label>
        <div className="flex items-center gap-sm">
          {usingDefault ? <span className="text-xs text-muted">{usingDefaultLabel}</span> : null}
          <Button type="button" variant="ghost" size="default" disabled={usingDefault} onClick={onReset}>
            {resetLabel}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <textarea
        className="min-h-[12rem] w-full rounded-md border border-border bg-surface px-md py-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}
