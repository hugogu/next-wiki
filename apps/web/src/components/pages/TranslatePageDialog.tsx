'use client';

import { useEffect, useState } from 'react';
import type {
  TranslationLanguageView,
  TranslationPromptTemplateView,
  TranslationRunAccepted,
  TranslationRunCreate,
} from '@next-wiki/shared';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type Model = { id: string; displayName: string };

/**
 * Reader-side dialog that queues a background translation run for a single page.
 * Config (languages, models, styles) is fetched on open from the admin-scoped
 * endpoints; the trigger that renders this is already gated to admins.
 */
export function TranslatePageDialog({
  pageId,
  initialTargetLocale,
  onClose,
}: {
  pageId: string;
  /** When set, the run targets this locale and the language picker is locked
   * (used by "re-translate" on an existing translated document). */
  initialTargetLocale?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<TranslationLanguageView[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [styles, setStyles] = useState<TranslationPromptTemplateView[]>([]);
  const [targetLocale, setTargetLocale] = useState(initialTargetLocale ?? '');
  const [modelId, setModelId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadJson<T>(url: string): Promise<{ items: T[] }> {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<{ items: T[] }>;
    }
    void Promise.all([
      loadJson<TranslationLanguageView>('/api/translations/languages'),
      loadJson<Model>('/api/translations/models'),
      loadJson<TranslationPromptTemplateView>('/api/translations/prompts'),
    ])
      .then(([lang, mdl, sty]) => {
        if (cancelled) return;
        const enabled = lang.items.filter((l) => l.enabled && !l.retired);
        setLanguages(enabled);
        setModels(mdl.items);
        setStyles(sty.items);
        setTargetLocale(initialTargetLocale ?? enabled[0]?.code ?? '');
      })
      .catch(() => {
        if (!cancelled) setErrorMessage(t('page.translate.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, initialTargetLocale]);

  async function submit() {
    if (!targetLocale) return;
    setSubmitting(true);
    setResult(null);
    setErrorMessage(null);
    try {
      const body: TranslationRunCreate = {
        targetLocale,
        modelId: modelId || undefined,
        promptVersionId: versionId || undefined,
        scope: { kind: 'page_ids', pageIds: [pageId] },
        mode: 'all',
      };
      await apiPost<TranslationRunCreate, TranslationRunAccepted>('/api/translations/runs', body);
      setResult('success');
    } catch (error) {
      setResult('error');
      setErrorMessage((error as ApiError).message || t('page.translate.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalDialog
      title={t('page.translate.title')}
      description={t('page.translate.description')}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      {loading ? (
        <p className="text-sm text-muted">{t('common.status.loading')}</p>
      ) : result === 'success' ? (
        <div className="space-y-md">
          <p className="rounded-md border border-primary/20 bg-primary/10 p-sm text-sm text-foreground" role="status">
            {t('page.translate.success')}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>{t('page.translate.close')}</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-md"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-xs text-sm">
            <span className="text-muted">{t('translation.run.targetLocale')}</span>
            {initialTargetLocale ? (
              <span className="rounded-md border border-border bg-surface-elevated px-sm py-sm font-mono text-sm uppercase">
                {targetLocale}
              </span>
            ) : (
              <Select value={targetLocale} onChange={(event) => setTargetLocale(event.target.value)}>
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.code.toUpperCase()}
                  </option>
                ))}
              </Select>
            )}
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="text-muted">{t('translation.run.model')}</span>
            <Select value={modelId} onChange={(event) => setModelId(event.target.value)}>
              <option value="">{t('translation.run.modelDefault')}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-xs text-sm">
            <span className="text-muted">{t('translation.run.style')}</span>
            <Select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
              <option value="">{t('translation.language.none')}</option>
              {styles
                .filter((style) => style.currentVersion)
                .map((style) => (
                  <option key={style.id} value={style.currentVersion!.id}>
                    {style.name}
                  </option>
                ))}
            </Select>
          </label>
          {result === 'error' && errorMessage && (
            <p className="text-sm text-danger" role="alert">{errorMessage}</p>
          )}
          <div className="flex justify-end gap-sm">
            <Button type="button" variant="ghost" onClick={onClose}>{t('page.translate.close')}</Button>
            <Button type="submit" disabled={submitting || !targetLocale || (!initialTargetLocale && languages.length === 0)}>
              {submitting ? t('common.status.saving') : t('translation.run.create')}
            </Button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
