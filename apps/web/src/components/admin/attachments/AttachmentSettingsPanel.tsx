'use client';

import { useState } from 'react';
import type { AttachmentCategory, AttachmentSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

const CATEGORIES: AttachmentCategory[] = ['image', 'video', 'document'];
const BYTES_PER_MB = 1024 * 1024;

export function AttachmentSettingsPanel({ initial }: { initial: AttachmentSettingsView }) {
  const { t } = useTranslation();
  const [maxSizeMb, setMaxSizeMb] = useState(String(Math.round(initial.maxSizeBytes / BYTES_PER_MB)));
  const [categories, setCategories] = useState<Set<AttachmentCategory>>(new Set(initial.allowedCategories));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(category: AttachmentCategory) {
    setCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function save() {
    if (categories.size === 0) {
      setMessage(null);
      setError(t('admin.attachmentSettings.atLeastOneCategory'));
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch('/api/settings/attachments', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        maxSizeBytes: Math.round(Number(maxSizeMb) * BYTES_PER_MB),
        allowedCategories: Array.from(categories),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(t('admin.attachmentSettings.saveError'));
      return;
    }
    setMessage(t('admin.attachmentSettings.saved'));
  }

  return (
    <div className="space-y-md rounded-lg border border-border p-md">
      <div>
        <label htmlFor="attachment-max-size" className="text-sm font-medium">
          {t('admin.attachmentSettings.maxSize.label')}
        </label>
        <p className="mt-1 text-xs text-muted">{t('admin.attachmentSettings.maxSize.help')}</p>
        <Input
          id="attachment-max-size"
          type="number"
          min={1}
          step={1}
          value={maxSizeMb}
          onChange={(event) => setMaxSizeMb(event.target.value)}
          className="mt-sm max-w-40"
        />
      </div>

      <div>
        <h2 className="text-sm font-medium">{t('admin.attachmentSettings.categories.title')}</h2>
        <p className="mt-1 text-xs text-muted">{t('admin.attachmentSettings.categories.description')}</p>
        <ul className="mt-sm space-y-sm">
          {CATEGORIES.map((category) => (
            <li key={category} className="flex items-center justify-between gap-md">
              <span className="text-sm">{t(`admin.attachmentSettings.categories.${category}`)}</span>
              <Switch
                checked={categories.has(category)}
                aria-label={t(`admin.attachmentSettings.categories.${category}`)}
                onClick={() => toggleCategory(category)}
              />
            </li>
          ))}
        </ul>
      </div>

      {message && <p className="text-sm text-success" role="status">{message}</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? t('common.status.saving') : t('common.actions.save')}
      </Button>
    </div>
  );
}
