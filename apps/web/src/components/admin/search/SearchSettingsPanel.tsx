'use client';

import { useState } from 'react';
import type { SearchSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export function SearchSettingsPanel({ initial }: { initial: SearchSettingsView }) {
  const { t } = useTranslation();
  const [semanticSearchEnabled, setSemanticSearchEnabled] = useState(initial.semanticSearchEnabled);
  const [minRelevanceScore, setMinRelevanceScore] = useState(String(initial.minRelevanceScore));
  const [showExcerpts, setShowExcerpts] = useState(initial.showExcerpts);
  const [excerptLength, setExcerptLength] = useState(String(initial.excerptLength));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch('/api/settings/search', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        semanticSearchEnabled,
        minRelevanceScore: Number(minRelevanceScore),
        showExcerpts,
        excerptLength: Number(excerptLength),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(t('admin.searchSettings.saveError'));
      return;
    }
    const body = await response.json() as SearchSettingsView;
    setSemanticSearchEnabled(body.semanticSearchEnabled);
    setMinRelevanceScore(String(body.minRelevanceScore));
    setShowExcerpts(body.showExcerpts);
    setExcerptLength(String(body.excerptLength));
    setMessage(t('admin.searchSettings.saved'));
  }

  return (
    <div className="max-w-3xl rounded-lg border border-border bg-surface p-lg shadow-sm">
      <div className="space-y-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.searchSettings.semantic.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.searchSettings.semantic.description')}</p>
          </div>
          <Switch
            checked={semanticSearchEnabled}
            aria-label={t('admin.searchSettings.semantic.title')}
            onClick={() => setSemanticSearchEnabled((value) => !value)}
          />
        </div>

        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.searchSettings.minRelevance.label')}</span>
          <Input
            type="number"
            min="-1"
            max="1"
            step="0.01"
            value={minRelevanceScore}
            onChange={(event) => setMinRelevanceScore(event.target.value)}
          />
          <span className="block text-xs text-muted">{t('admin.searchSettings.minRelevance.help')}</span>
        </label>

        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.searchSettings.excerpts.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.searchSettings.excerpts.description')}</p>
          </div>
          <Switch
            checked={showExcerpts}
            aria-label={t('admin.searchSettings.excerpts.title')}
            onClick={() => setShowExcerpts((value) => !value)}
          />
        </div>

        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.searchSettings.excerptLength.label')}</span>
          <Input
            type="number"
            min="20"
            max="500"
            step="10"
            disabled={!showExcerpts}
            value={excerptLength}
            onChange={(event) => setExcerptLength(event.target.value)}
          />
          <span className="block text-xs text-muted">{t('admin.searchSettings.excerptLength.help')}</span>
        </label>

        <div className="flex items-center gap-md">
          <Button onClick={save} disabled={saving}>{saving ? t('common.status.saving') : t('common.actions.save')}</Button>
          {message && <span className="text-sm text-muted">{message}</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>
    </div>
  );
}
