'use client';

import { useState } from 'react';
import type { SearchSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export function SearchSettingsPanel({ initial }: { initial: SearchSettingsView }) {
  const { t } = useTranslation();
  const [fullTextSearchEnabled, setFullTextSearchEnabled] = useState(initial.fullTextSearchEnabled);
  const [fuzzySearchEnabled, setFuzzySearchEnabled] = useState(initial.fuzzySearchEnabled);
  const [semanticSearchEnabled, setSemanticSearchEnabled] = useState(initial.semanticSearchEnabled);
  const [immediateSearchTimeoutMs, setImmediateSearchTimeoutMs] = useState(String(initial.immediateSearchTimeoutMs));
  const [minRelevanceScore, setMinRelevanceScore] = useState(String(initial.minRelevanceScore));
  const [showExcerpts, setShowExcerpts] = useState(initial.showExcerpts);
  const [excerptLength, setExcerptLength] = useState(String(initial.excerptLength));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lexicalDisabled = !fullTextSearchEnabled && !fuzzySearchEnabled;

  async function save() {
    if (lexicalDisabled) {
      setMessage(null);
      setError(t('admin.searchSettings.lexicalRequired'));
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch('/api/settings/search', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullTextSearchEnabled,
        fuzzySearchEnabled,
        semanticSearchEnabled,
        immediateSearchTimeoutMs: Number(immediateSearchTimeoutMs),
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
    setFullTextSearchEnabled(body.fullTextSearchEnabled);
    setFuzzySearchEnabled(body.fuzzySearchEnabled);
    setSemanticSearchEnabled(body.semanticSearchEnabled);
    setImmediateSearchTimeoutMs(String(body.immediateSearchTimeoutMs));
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
            <h2 className="font-display text-lg font-semibold">{t('admin.searchSettings.fullText.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.searchSettings.fullText.description')}</p>
          </div>
          <Switch
            checked={fullTextSearchEnabled}
            aria-label={t('admin.searchSettings.fullText.title')}
            onClick={() => setFullTextSearchEnabled((value) => !value)}
          />
        </div>

        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.searchSettings.immediateTimeout.label')}</span>
          <Input
            type="number"
            min="100"
            max="2000"
            step="50"
            value={immediateSearchTimeoutMs}
            onChange={(event) => setImmediateSearchTimeoutMs(event.target.value)}
          />
          <span className="block text-xs text-muted">{t('admin.searchSettings.immediateTimeout.help')}</span>
        </label>

        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.searchSettings.fuzzy.title')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.searchSettings.fuzzy.description')}</p>
          </div>
          <Switch
            checked={fuzzySearchEnabled}
            aria-label={t('admin.searchSettings.fuzzy.title')}
            onClick={() => setFuzzySearchEnabled((value) => !value)}
          />
        </div>

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
          <Button onClick={save} disabled={saving || lexicalDisabled}>{saving ? t('common.status.saving') : t('common.actions.save')}</Button>
          {message && <span className="text-sm text-muted">{message}</span>}
          {error && <span role="alert" className="text-sm text-danger">{error}</span>}
        </div>
        {lexicalDisabled && <p role="alert" className="text-sm text-danger">{t('admin.searchSettings.lexicalRequired')}</p>}
      </div>
    </div>
  );
}
