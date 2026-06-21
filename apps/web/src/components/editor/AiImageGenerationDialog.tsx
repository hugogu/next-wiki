'use client';

import { useEffect, useState } from 'react';
import type { EditorSelectionSnapshot } from './AiTextOptimizationDialog';
import { useAiAction } from '@/hooks/use-ai-action';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { XIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

export function AiImageGenerationDialog({
  pageId,
  revisionId,
  selection,
  onInsert,
  onClose,
}: {
  pageId: string;
  revisionId: string;
  selection: EditorSelectionSnapshot | null;
  onInsert: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const action = useAiAction();
  const cancelAction = action.cancel;
  const [sourceKind, setSourceKind] = useState<'page' | 'selection'>(selection ? 'selection' : 'page');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [artifact, setArtifact] = useState<{ id: string; previewUrl: string } | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => cancelAction(), [cancelAction]);

  async function discard() {
    if (artifact) await fetch(`/api/ai/generated-artifacts/${artifact.id}`, { method: 'DELETE' }).catch(() => undefined);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl space-y-md rounded-lg border border-border bg-surface p-lg shadow-lg">
        <div className="flex items-start justify-between gap-md">
          <h2 className="font-display text-xl font-semibold">{t('ai.image.title')}</h2>
          <Tooltip label={t('common.actions.cancel')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('common.actions.cancel')}
              onClick={() => void discard()}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        <div className="grid gap-sm md:grid-cols-2">
          <Select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as 'page' | 'selection')}>
            <option value="page">{t('ai.image.source.page')}</option>
            <option value="selection" disabled={!selection}>{t('ai.image.source.selection')}</option>
          </Select>
          <Select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
            {['1:1', '4:3', '3:2', '16:9', '9:16'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
          </Select>
        </div>
        {/* Authenticated, short-lived preview URLs are intentionally not sent through the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {artifact && <img src={artifact.previewUrl} alt={t('ai.image.preview')} className="max-h-[28rem] w-full rounded object-contain bg-background" />}
        {(error || action.error) && <p className="text-sm text-danger">{error ?? action.error?.message}</p>}
        <div className="flex justify-end gap-sm">
          <Button variant="ghost" onClick={() => void discard()}>{t('common.actions.cancel')}</Button>
          {!artifact && (
            <Button
              disabled={action.running}
              onClick={() => {
                setError(null);
                void action.start('/api/ai/images', {
                  pageId,
                  revisionId,
                  source: sourceKind === 'selection' && selection
                    ? { kind: 'selection', text: selection.text, hash: selection.hash }
                    : { kind: 'page' },
                  aspectRatio,
                }, (event) => {
                  if (event.type === 'image_ready') setArtifact({
                    id: String(event.payload.artifactId),
                    previewUrl: String(event.payload.previewUrl),
                  });
                }).catch(() => undefined);
              }}
            >
              {action.running ? t('ai.image.generating') : t('ai.image.generate')}
            </Button>
          )}
          {artifact && (
            <Button
              disabled={promoting}
              onClick={async () => {
                setPromoting(true);
                const response = await fetch(`/api/ai/generated-artifacts/${artifact.id}/asset`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ pageId }),
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                  setError(String(body.message ?? t('ai.image.error')));
                  setPromoting(false);
                  return;
                }
                onInsert(String(body.url));
                onClose();
              }}
            >
              {promoting ? t('ai.image.confirming') : t('ai.image.confirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
