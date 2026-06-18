'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import type { ApiKeyScope, ApiKeyCreated } from '@next-wiki/shared';
import { apiPost } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { XIcon } from '@/components/icons';

const SCOPE_ORDER: ApiKeyScope[] = ['view', 'create', 'edit', 'delete', 'share', 'run'];

interface ApiKeyCreateDialogProps {
  onClose: () => void;
  onCreated: (key: ApiKeyCreated) => void;
}

export function ApiKeyCreateDialog({ onClose, onCreated }: ApiKeyCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopes.length === 0) {
      setError(t('userCenter.apiKeys.atLeastOneScope'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await apiPost<{ name: string; scopes: ApiKeyScope[] }, ApiKeyCreated>('/api/api-keys', {
        name,
        scopes,
      });
      onCreated(result);
      onClose();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-lg shadow-lg">
        <div className="flex items-center justify-between mb-md">
          <h3 className="font-display text-xl font-semibold">{t('userCenter.apiKeys.createTitle')}</h3>
          <Button type="button" variant="ghost" onClick={onClose} aria-label={t('common.actions.dismiss')}>
            <XIcon />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-md">
          <div>
            <label htmlFor="key-name" className="block text-sm font-medium mb-xs">
              {t('userCenter.apiKeys.nameLabel')}
            </label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('userCenter.apiKeys.namePlaceholder')}
              required
              minLength={1}
              maxLength={100}
            />
          </div>

          <div>
            <span className="block text-sm font-medium mb-xs">{t('userCenter.apiKeys.scopesLabel')}</span>
            <p className="text-xs text-muted mb-sm">{t('userCenter.apiKeys.scopesHint')}</p>
            <div className="grid grid-cols-2 gap-sm">
              {SCOPE_ORDER.map((scope) => (
                <label key={scope} className="flex items-start gap-sm rounded-md border border-border p-sm cursor-pointer hover:bg-surface-elevated">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="mt-1"
                  />
                  <div className="text-sm">
                    <div className="font-medium">{t(`userCenter.apiKeys.scope.${scope}` as never)}</div>
                    <div className="text-muted text-xs">{t(`userCenter.apiKeys.scopeDescriptions.${scope}` as never)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-sm">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? t('userCenter.profile.savingButton') : t('userCenter.apiKeys.createButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
