'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AiRuntimeSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { UndoIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

type PromptTab = 'assistant' | 'tool';
const TABS: PromptTab[] = ['assistant', 'tool'];

function parseTab(value: string | null): PromptTab {
  return TABS.includes(value as PromptTab) ? (value as PromptTab) : 'assistant';
}

/**
 * Wiki AI runtime prompts (026), edited from AI > Prompts. Each prompt is shown
 * with its built-in default already filled in and fully editable; the reset
 * icon restores that default. Saving a value equal to the default clears the
 * stored override so the prompt keeps tracking future default changes. The live
 * tool catalog and tool-call protocol are injected by the runtime at {{TOOLS}}.
 */
export function AiPromptsPanel({ initial }: { initial: AiRuntimeSettingsView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const [assistant, setAssistant] = useState(
    initial.prompts.assistantSystemPrompt ?? initial.defaults.assistantSystemPrompt,
  );
  const [tool, setTool] = useState(initial.prompts.toolSystemPrompt ?? initial.defaults.toolSystemPrompt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const selectTab = (next: PromptTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/ai/runtime-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // A value equal to the default clears the override (keeps tracking it).
          assistantSystemPrompt: assistant.trim() === initial.defaults.assistantSystemPrompt.trim() ? null : assistant,
          toolSystemPrompt: tool.trim() === initial.defaults.toolSystemPrompt.trim() ? null : tool,
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
    <div className="space-y-md">
      <SettingsTabs<PromptTab>
        tabs={[
          { id: 'assistant', label: t('admin.ai.prompts.tabs.assistant') },
          { id: 'tool', label: t('admin.ai.prompts.tabs.tool') },
        ]}
        selected={tab}
        onSelect={selectTab}
      >
        {tab === 'assistant' && (
          <PromptEditor
            help={t('admin.ai.prompts.assistant.help')}
            value={assistant}
            defaultValue={initial.defaults.assistantSystemPrompt}
            usingDefaultLabel={t('admin.ai.prompts.usingDefault')}
            resetLabel={t('admin.ai.prompts.reset')}
            onChange={setAssistant}
          />
        )}
        {tab === 'tool' && (
          <PromptEditor
            help={t('admin.ai.prompts.tool.help')}
            value={tool}
            defaultValue={initial.defaults.toolSystemPrompt}
            usingDefaultLabel={t('admin.ai.prompts.usingDefault')}
            resetLabel={t('admin.ai.prompts.reset')}
            onChange={setTool}
          />
        )}
      </SettingsTabs>

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

function PromptEditor({
  help,
  value,
  defaultValue,
  usingDefaultLabel,
  resetLabel,
  onChange,
}: {
  help: string;
  value: string;
  defaultValue: string;
  usingDefaultLabel: string;
  resetLabel: string;
  onChange: (value: string) => void;
}) {
  const usingDefault = value.trim() === defaultValue.trim();
  return (
    <section className="space-y-sm">
      <div className="flex items-start justify-between gap-sm">
        <p className="text-xs text-muted">{help}</p>
        <div className="flex shrink-0 items-center gap-sm">
          {usingDefault ? <span className="text-xs text-muted">{usingDefaultLabel}</span> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={usingDefault}
            title={resetLabel}
            aria-label={resetLabel}
            onClick={() => onChange(defaultValue)}
          >
            <UndoIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <textarea
        className="min-h-[24rem] w-full rounded-md border border-border bg-surface px-md py-sm font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50"
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}
