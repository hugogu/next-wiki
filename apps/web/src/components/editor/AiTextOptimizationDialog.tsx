'use client';

import { useEffect, useState } from 'react';
import { useAiAction } from '@/hooks/use-ai-action';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';

export type EditorSelectionSnapshot = {
  text: string;
  from: number;
  to: number;
  hash: string;
};

export async function hashEditorSelection(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function applyExactSelection(
  document: string,
  original: EditorSelectionSnapshot,
  replacement: string,
): string | null {
  if (document.slice(original.from, original.to) !== original.text) return null;
  return `${document.slice(0, original.from)}${replacement}${document.slice(original.to)}`;
}

export function AiTextOptimizationDialog({
  pageId,
  revisionId,
  selection,
  onAccept,
  onClose,
}: {
  pageId: string;
  revisionId: string;
  selection: EditorSelectionSnapshot;
  onAccept: (replacement: string, original: EditorSelectionSnapshot) => boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const action = useAiAction();
  const cancelAction = action.cancel;
  const [instruction, setInstruction] = useState('improve_clarity');
  const [replacement, setReplacement] = useState('');
  const [stale, setStale] = useState(false);

  useEffect(() => () => cancelAction(), [cancelAction]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
      <div role="dialog" aria-modal="true" className="w-full max-w-3xl space-y-md rounded-lg border border-border bg-surface p-lg shadow-lg">
        <h2 className="font-display text-xl font-semibold">{t('ai.optimize.title')}</h2>
        <Select value={instruction} onChange={(event) => setInstruction(event.target.value)}>
          <option value="improve_clarity">{t('ai.optimize.instruction.clarity')}</option>
          <option value="fix_grammar">{t('ai.optimize.instruction.grammar')}</option>
          <option value="shorten">{t('ai.optimize.instruction.shorten')}</option>
          <option value="expand">{t('ai.optimize.instruction.expand')}</option>
        </Select>
        <div className="grid gap-md md:grid-cols-2">
          <div><h3 className="mb-xs text-sm font-medium">{t('ai.optimize.original')}</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background p-md text-sm">{selection.text}</pre></div>
          <div><h3 className="mb-xs text-sm font-medium">{t('ai.optimize.suggestion')}</h3><pre className="max-h-72 min-h-24 overflow-auto whitespace-pre-wrap rounded bg-background p-md text-sm">{replacement || (action.running ? t('ai.optimize.generating') : '')}</pre></div>
        </div>
        {(action.error || stale) && <p className="text-sm text-danger">{stale ? t('ai.optimize.stale') : action.error?.message}</p>}
        <div className="flex justify-end gap-sm">
          <Button variant="ghost" onClick={onClose}>{t('ai.optimize.reject')}</Button>
          {!replacement && (
            <Button
              disabled={action.running}
              onClick={() => {
                setReplacement('');
                void action.start('/api/ai/optimizations', {
                  pageId, revisionId, selection, instruction,
                }, (event) => {
                  if (event.type === 'optimization') setReplacement(String(event.payload.replacement ?? ''));
                }).catch(() => undefined);
              }}
            >
              {action.running ? t('ai.optimize.generating') : t('ai.optimize.request')}
            </Button>
          )}
          {replacement && (
            <Button onClick={() => {
              if (onAccept(replacement, selection)) onClose();
              else setStale(true);
            }}>{t('ai.optimize.accept')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
