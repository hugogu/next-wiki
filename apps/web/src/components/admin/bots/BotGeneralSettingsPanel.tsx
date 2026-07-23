'use client';

import { useState } from 'react';
import type { BotGeneralSettings } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiPatch, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

export function BotGeneralSettingsPanel({ initial }: { initial: BotGeneralSettings }) {
  const { t } = useTranslation();
  const [minimumScore, setMinimumScore] = useState(String(initial.wikiQuestionMinRelevanceScore));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiPatch<
        { wikiQuestionMinRelevanceScore: number },
        BotGeneralSettings
      >('/api/settings/bots/general', {
        wikiQuestionMinRelevanceScore: Number(minimumScore),
      });
      setMinimumScore(String(updated.wikiQuestionMinRelevanceScore));
      setMessage(t('admin.bots.general.saved'));
    } catch (cause) {
      setError((cause as ApiError).message ?? String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-md">
      <header>
        <h2 className="font-display text-lg font-semibold">{t('admin.bots.general.retrieval.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.bots.general.retrieval.description')}</p>
      </header>
      <label className="block max-w-xs space-y-xs">
        <span className="text-sm font-medium">{t('admin.bots.general.retrieval.minimumScore')}</span>
        <Input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={minimumScore}
          onChange={(event) => setMinimumScore(event.target.value)}
        />
        <span className="block text-xs text-muted">{t('admin.bots.general.retrieval.minimumScoreHelp')}</span>
      </label>
      <div className="flex items-center gap-md">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? t('common.status.saving') : t('common.actions.save')}
        </Button>
        {message && <span className="text-sm text-muted">{message}</span>}
        {error && <span role="alert" className="text-sm text-danger">{error}</span>}
      </div>
    </section>
  );
}
