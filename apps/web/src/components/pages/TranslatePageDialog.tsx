'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  TranslationLanguageView,
  TranslationPromptTemplateView,
  TranslationRunAccepted,
  TranslationRunCreate,
  TranslationRunItemList,
  TranslationRunItemView,
  TranslationRunView,
} from '@next-wiki/shared';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { apiGet, apiPost, type ApiError } from '@/lib/api/client';
import { getTranslatedPageHref } from '@/lib/path';
import { useTranslation } from '@/i18n/client';
import {
  getTranslationApiErrorMessage,
  getTranslationErrorMessage,
} from '@/i18n/error-messages';
import type { TranslationKey } from '@/i18n/types';

type Model = { id: string; displayName: string };

const POLL_INTERVAL_MS = 2_000;
/** Stop following a run after this long. Long tasks belong to the admin view,
 * and an open dialog must not poll a browser tab forever. */
const MAX_TRACKING_MS = 5 * 60_000;

const TERMINAL_RUN_STATUSES: ReadonlyArray<TranslationRunView['status']> = [
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
];

export type TranslateRunOutcome = {
  tone: 'success' | 'warning' | 'danger';
  messageKey: TranslationKey;
  /** The published translation, when there is one to open. */
  href: string | null;
  /** Machine code behind the outcome, shown verbatim for diagnosis. */
  code: string | null;
  /** English server text, used only when no code maps to a catalog message. */
  message: string | null;
};

/**
 * Turn a finished run plus its single page item into what the reader is told.
 * A one-page run records the real reason on the item (the run itself only fails
 * on infrastructure errors), so the item is the primary source and the run is
 * the fallback.
 */
export function deriveTranslateOutcome(
  run: TranslationRunView,
  item: TranslationRunItemView | null,
): TranslateRunOutcome {
  const failure = {
    tone: 'danger' as const,
    messageKey: 'page.translate.result.failed' as TranslationKey,
    href: null,
    code: item?.errorCode ?? run.errorCode,
    message: item?.errorMessage ?? run.errorMessage,
  };
  switch (item?.status) {
    case 'completed':
      return {
        tone: 'success',
        messageKey: 'page.translate.result.completed',
        href: item.targetPath ? getTranslatedPageHref(run.targetLocale, item.targetPath) : null,
        code: null,
        message: null,
      };
    case 'skipped':
      return {
        tone: 'warning',
        messageKey: 'page.translate.result.skipped',
        href: null,
        code: item.warningCode,
        message: null,
      };
    case 'superseded':
      return {
        tone: 'warning',
        messageKey: 'page.translate.result.superseded',
        href: null,
        code: null,
        message: null,
      };
    case 'cancelled':
      return {
        tone: 'warning',
        messageKey: 'page.translate.result.cancelled',
        href: null,
        code: null,
        message: null,
      };
    case 'failed':
      return failure;
    default:
      break;
  }
  // No item outcome to read (its list could not be fetched, or the run died
  // before claiming the page): fall back to the run's own status.
  if (run.status === 'completed' || run.status === 'completed_with_warnings') {
    return {
      tone: 'success',
      messageKey: 'page.translate.result.completed',
      href: null,
      code: null,
      message: null,
    };
  }
  if (run.status === 'cancelled') {
    return {
      tone: 'warning',
      messageKey: 'page.translate.result.cancelled',
      href: null,
      code: null,
      message: null,
    };
  }
  return failure;
}

/**
 * The task's own admin page. It opens in a new tab so a reader following the
 * progress hint does not lose the page they were reading.
 */
function RunDetailLink({ runId, label }: { runId: string; label: string }) {
  return (
    <Link
      className="text-sm text-primary hover:underline"
      href={`/admin/translations/${runId}`}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </Link>
  );
}

const TONE_CLASS: Record<TranslateRunOutcome['tone'], string> = {
  success: 'border-success/40 bg-success/10 text-foreground',
  warning: 'border-warning/40 bg-warning-subtle text-foreground',
  danger: 'border-danger/40 bg-danger-subtle text-foreground',
};

/**
 * Reader-side dialog that queues a background translation run for a single page
 * and then follows it to its real outcome — a run can fail seconds after it is
 * accepted, so reporting "queued" and closing would leave the reader believing a
 * translation exists. Config (languages, models, styles) is fetched on open from
 * the admin-scoped endpoints; the trigger that renders this is already gated to
 * admins, which is also what allows it to read the run's progress.
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
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<TranslationRunView | null>(null);
  const [item, setItem] = useState<TranslationRunItemView | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  const [trackError, setTrackError] = useState<ApiError | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
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
        // Localized at render time, so a change of `t` cannot re-run the load.
        if (!cancelled) setConfigFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialTargetLocale]);

  // Follow the accepted run until it finishes, then read its page outcome once.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + MAX_TRACKING_MS;

    async function poll() {
      try {
        const current = await apiGet<TranslationRunView>(`/api/translations/runs/${runId}`);
        if (cancelled) return;
        setRun(current);
        if (TERMINAL_RUN_STATUSES.includes(current.status)) {
          const list = await apiGet<TranslationRunItemList>(
            `/api/translations/runs/${runId}/items`,
          );
          if (!cancelled) setItem(list.items[0] ?? null);
          return;
        }
        // A paused run needs an administrator's decision; stop following it.
        if (current.status === 'paused' || Date.now() >= deadline) {
          setAbandoned(true);
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (error) {
        if (!cancelled) {
          // Localized at render time so this effect never depends on `t`, whose
          // identity changing would restart polling.
          setTrackError(error as ApiError);
          setAbandoned(true);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  async function submit() {
    if (!targetLocale) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const body: TranslationRunCreate = {
        targetLocale,
        modelId: modelId || undefined,
        promptVersionId: versionId || undefined,
        scope: { kind: 'page_ids', pageIds: [pageId] },
        mode: 'all',
      };
      const accepted = await apiPost<TranslationRunCreate, TranslationRunAccepted>(
        '/api/translations/runs',
        body,
      );
      setRunId(accepted.id);
    } catch (error) {
      setErrorMessage(
        getTranslationApiErrorMessage(t, error as ApiError, 'page.translate.error'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const finished = run !== null && TERMINAL_RUN_STATUSES.includes(run.status);
  const outcome = finished ? deriveTranslateOutcome(run, item) : null;
  const reason = outcome
    ? [
        getTranslationErrorMessage(t, outcome.code, outcome.message),
        outcome.code ? `(${outcome.code})` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <ModalDialog
      title={t('page.translate.title')}
      description={t('page.translate.description')}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      {loading ? (
        <p className="text-sm text-muted">{t('common.status.loading')}</p>
      ) : runId ? (
        <div className="space-y-md">
          {outcome ? (
            <div
              className={`space-y-xs rounded-md border p-sm text-sm ${TONE_CLASS[outcome.tone]}`}
              role={outcome.tone === 'danger' ? 'alert' : 'status'}
            >
              <p>{t(outcome.messageKey)}</p>
              {reason && <p className="text-xs text-muted">{reason}</p>}
              {outcome.href && (
                <Link className="text-primary hover:underline" href={outcome.href}>
                  {t('page.translate.action.view')}
                </Link>
              )}
            </div>
          ) : (
            <div
              className="space-y-xs rounded-md border border-primary/20 bg-primary/10 p-sm text-sm text-foreground"
              role="status"
            >
              <p>
                {abandoned
                  ? trackError
                    ? getTranslationApiErrorMessage(t, trackError, 'page.translate.trackError')
                    : t('page.translate.state.stillRunning')
                  : run?.status === 'running'
                    ? t('page.translate.state.running')
                    : t('page.translate.state.queued')}
              </p>
              <RunDetailLink runId={runId} label={t('page.translate.action.detail')} />
            </div>
          )}
          <div className="flex items-center justify-between gap-sm">
            {outcome ? (
              <RunDetailLink runId={runId} label={t('page.translate.action.detail')} />
            ) : (
              <span />
            )}
            <Button type="button" onClick={onClose}>
              {t('page.translate.close')}
            </Button>
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
          {(errorMessage || configFailed) && (
            <p className="text-sm text-danger" role="alert">
              {errorMessage ?? t('page.translate.error')}
            </p>
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
