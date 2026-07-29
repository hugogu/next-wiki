'use client';

import { useId, useState } from 'react';
import { AI_EVENT_RETENTION_HOURS_MAX } from '@next-wiki/shared';
import { apiPatch, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

/**
 * Retention for an action's event log and its generated images (004).
 *
 * The event log doubles as replayable chat history — reopening a past
 * conversation renders it from these rows — so the window is an operator
 * decision rather than a build-time constant, and it belongs next to the
 * action audit it governs.
 */
export function AiRetentionPanel({
  eventRetentionHours,
  artifactRetentionHours,
}: {
  eventRetentionHours: number;
  artifactRetentionHours: number;
}) {
  const { t } = useTranslation();
  const eventsId = useId();
  const artifactsId = useId();
  const [form, setForm] = useState({
    events: String(eventRetentionHours),
    artifacts: String(artifactRetentionHours),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const events = Number(form.events);
  const artifacts = Number(form.artifacts);
  const valid =
    Number.isInteger(events) &&
    events >= 1 &&
    events <= AI_EVENT_RETENTION_HOURS_MAX &&
    Number.isInteger(artifacts) &&
    artifacts >= 1 &&
    artifacts <= 168;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPatch('/api/ai/settings', {
        eventRetentionHours: events,
        artifactRetentionHours: artifacts,
      });
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.retention.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border p-md">
      <h3 className="text-sm font-medium">{t('admin.ai.retention.title')}</h3>
      <p className="mt-xs text-sm text-muted">{t('admin.ai.retention.description')}</p>
      <div className="mt-md grid gap-md md:grid-cols-2">
        <label className="text-sm font-medium" htmlFor={eventsId}>
          {t('admin.ai.retention.events')}
          <input
            id={eventsId}
            type="number"
            min="1"
            max={AI_EVENT_RETENTION_HOURS_MAX}
            className="mt-xs w-full rounded-md border border-border bg-surface px-md py-sm"
            value={form.events}
            onChange={(event) => setForm((value) => ({ ...value, events: event.target.value }))}
          />
        </label>
        <label className="text-sm font-medium" htmlFor={artifactsId}>
          {t('admin.ai.retention.artifacts')}
          <input
            id={artifactsId}
            type="number"
            min="1"
            max="168"
            className="mt-xs w-full rounded-md border border-border bg-surface px-md py-sm"
            value={form.artifacts}
            onChange={(event) => setForm((value) => ({ ...value, artifacts: event.target.value }))}
          />
        </label>
      </div>
      <div className="mt-md">
        <Button disabled={!valid || saving} onClick={() => void save()}>
          {saving ? t('admin.ai.retention.saving') : t('admin.ai.retention.save')}
        </Button>
      </div>
      {error && (
        <div className="mt-sm">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  );
}
