'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TranslationPromptCreate, TranslationPromptTemplateView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

function StyleCard({ style }: { style: TranslationPromptTemplateView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [body, setBody] = useState(style.currentVersion?.body ?? '');
  const [editing, setEditing] = useState(false);
  const addVersion = useApiMutation<{ body: string }>(`/api/translations/prompts/${style.id}`, {
    method: 'PATCH',
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });

  return (
    <div className="rounded-lg border border-border p-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <span className="font-medium">{style.name}</span>
          {style.currentVersion && (
            <StatusBadge tone="info">
              {t('translation.style.version', { n: style.currentVersion.versionNumber })}
            </StatusBadge>
          )}
          {style.retired && <StatusBadge tone="neutral">{t('translation.language.retired')}</StatusBadge>}
        </div>
        {!style.retired && (
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {t('translation.style.newVersion')}
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="mt-sm space-y-sm"
          onSubmit={(e) => {
            e.preventDefault();
            addVersion.mutate({ body: body.trim() });
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-xs">
            <Button type="submit" disabled={addVersion.isPending || body.trim().length === 0}>
              {addVersion.isPending ? t('common.status.saving') : t('common.actions.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.actions.cancel')}
            </Button>
          </div>
          {addVersion.error && <p className="text-sm text-danger">{addVersion.error.message}</p>}
        </form>
      ) : (
        <p className="mt-sm whitespace-pre-wrap text-sm text-muted">{style.currentVersion?.body}</p>
      )}
    </div>
  );
}

export function TranslationPromptManager({ styles }: { styles: TranslationPromptTemplateView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const create = useApiMutation<TranslationPromptCreate>('/api/translations/prompts', {
    onSuccess: () => {
      setName('');
      setBody('');
      router.refresh();
    },
  });

  return (
    <div className="space-y-md">
      <form
        className="space-y-sm rounded-lg border border-border p-md"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name: name.trim(), body: body.trim() });
        }}
      >
        <label className="flex flex-col gap-xs text-sm">
          <span className="text-muted">{t('translation.style.name')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="text-muted">{t('translation.style.body')}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            required
          />
        </label>
        <Button type="submit" disabled={create.isPending || !name.trim() || !body.trim()}>
          {create.isPending ? t('common.status.saving') : t('translation.style.add')}
        </Button>
        {create.error && <span className="ml-sm text-sm text-danger">{create.error.message}</span>}
      </form>

      {styles.length === 0 ? (
        <p className="rounded-lg border border-border p-md text-sm text-muted">
          {t('translation.style.empty')}
        </p>
      ) : (
        <div className="space-y-sm">
          {styles.map((style) => (
            <StyleCard key={style.id} style={style} />
          ))}
        </div>
      )}
    </div>
  );
}
