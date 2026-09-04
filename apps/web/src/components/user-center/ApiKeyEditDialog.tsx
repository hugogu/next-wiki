'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import {
  API_KEY_SCOPES,
  API_KEY_SPACE_KINDS,
  type ApiKeyScope,
  type ApiKeyView,
  type SpaceKind,
  type UpdateApiKeyInput,
} from '@next-wiki/shared';
import { apiPatch } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { XIcon } from '@/components/icons';

interface ApiKeyEditDialogProps {
  apiKey: ApiKeyView;
  currentUserIsAdmin: boolean;
  onClose: () => void;
  onUpdated: (apiKey: ApiKeyView) => void;
}

const memoryProviderScopes: readonly ApiKeyScope[] = ['memory.read', 'memory.write', 'memory.delete'];

export function ApiKeyEditDialog({ apiKey, currentUserIsAdmin, onClose, onUpdated }: ApiKeyEditDialogProps) {
  const { t } = useTranslation();
  const [scopes, setScopes] = useState<ApiKeyScope[]>(apiKey.scopes);
  const [spaceAccess, setSpaceAccess] = useState<SpaceKind[]>(apiKey.spaceAccess);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((previous) =>
      previous.includes(scope) ? previous.filter((item) => item !== scope) : [...previous, scope],
    );
  };

  const toggleSpace = (space: SpaceKind) => {
    if (space === 'wiki') return;
    setSpaceAccess((previous) =>
      previous.includes(space) ? previous.filter((item) => item !== space) : [...previous, space],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (scopes.length === 0) {
      setError(t('userCenter.apiKeys.atLeastOneScope'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const updated = await apiPatch<UpdateApiKeyInput, ApiKeyView>(`/api/api-keys/${apiKey.id}`, {
        scopes,
        spaceAccess,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : t('userCenter.apiKeys.editFailed');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-surface p-lg shadow-lg">
        <div className="mb-md flex items-center justify-between gap-md">
          <div>
            <h3 className="font-display text-xl font-semibold">{t('userCenter.apiKeys.editTitle')}</h3>
            <p className="mt-xs text-sm text-muted">{apiKey.name}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-9 w-9 px-0"
            aria-label={t('common.actions.dismiss')}
            title={t('common.actions.dismiss')}
          >
            <XIcon />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-md">
          <p className="text-sm text-muted">{t('userCenter.apiKeys.editHint')}</p>

          <div>
            <span className="mb-xs block text-sm font-medium">{t('userCenter.apiKeys.scopesLabel')}</span>
            <p className="mb-sm text-xs text-muted">{t('userCenter.apiKeys.scopesHint')}</p>
            <div className="grid grid-cols-1 gap-sm md:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => {
                const disabled = !currentUserIsAdmin && memoryProviderScopes.includes(scope) && !apiKey.scopes.includes(scope);
                return (
                  <label
                    key={scope}
                    className={`flex items-start gap-sm rounded-md border border-border p-sm ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'}`}
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      disabled={disabled}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{t(`userCenter.apiKeys.scope.${scope}` as never)}</div>
                      <div className="text-muted text-xs">{t(`userCenter.apiKeys.scopeDescriptions.${scope}` as never)}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-xs block text-sm font-medium">{t('userCenter.apiKeys.spaceAccessLabel')}</span>
            <p className="mb-sm text-xs text-muted">{t('userCenter.apiKeys.spaceAccessHint')}</p>
            <div className="grid grid-cols-1 gap-sm md:grid-cols-3">
              {API_KEY_SPACE_KINDS.map((space) => {
                const disabled = space === 'wiki' || (!currentUserIsAdmin && !apiKey.spaceAccess.includes(space));
                const checked = space === 'wiki' || spaceAccess.includes(space);
                return (
                  <label
                    key={space}
                    className={`flex items-start gap-sm rounded-md border border-border p-sm ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleSpace(space)}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{t(`userCenter.apiKeys.space.${space}` as never)}</div>
                      <div className="text-muted text-xs">{t(`userCenter.apiKeys.spaceDescriptions.${space}` as never)}</div>
                      {space !== 'wiki' && !currentUserIsAdmin && (
                        <div className="text-warning text-xs">{t('userCenter.apiKeys.spaceAccessAdminOnly')}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-sm">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.status.saving') : t('userCenter.apiKeys.saveChanges')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
