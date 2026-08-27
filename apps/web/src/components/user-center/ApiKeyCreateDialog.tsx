'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/client';
import {
  API_KEY_SCOPES,
  API_KEY_SPACE_KINDS,
  type ApiKeyScope,
  type ApiKeyCreated,
  type SpaceKind,
} from '@next-wiki/shared';
import { apiGet, apiPost } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { XIcon } from '@/components/icons';

interface ApiKeyCreateDialogProps {
  onClose: () => void;
  onCreated: (key: ApiKeyCreated) => void;
  /** 046: only admins may grant raw/generated space access to a new key. */
  currentUserIsAdmin: boolean;
}

type HermesMemoryDestination = {
  id: string;
  displayName: string;
  state: 'active' | 'disabled';
};

export function ApiKeyCreateDialog({ onClose, onCreated, currentUserIsAdmin }: ApiKeyCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [spaceAccess, setSpaceAccess] = useState<SpaceKind[]>(['wiki']);
  const [hermesDestinations, setHermesDestinations] = useState<HermesMemoryDestination[]>([]);
  const [sharedNamespaceId, setSharedNamespaceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const hermesScopes: ApiKeyScope[] = ['memory.read', 'memory.write', 'memory.delete'];
  const isHermesMemoryKey = hermesScopes.some((scope) => scopes.includes(scope));

  const toggleHermesMemory = () => {
    setScopes(() => (isHermesMemoryKey ? [] : hermesScopes));
    setSpaceAccess(['wiki']);
  };

  const toggleSpace = (space: SpaceKind) => {
    if (space === 'wiki') return; // always included, not user-toggleable
    setSpaceAccess((prev) =>
      prev.includes(space) ? prev.filter((s) => s !== space) : [...prev, space],
    );
  };

  useEffect(() => {
    if (!isHermesMemoryKey) return;
    let cancelled = false;
    void apiGet<HermesMemoryDestination[]>('/api/api-keys/hermes-memory-destinations')
      .then((destinations) => {
        if (!cancelled) setHermesDestinations(destinations.filter((destination) => destination.state === 'active'));
      })
      .catch(() => {
        if (!cancelled) setHermesDestinations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isHermesMemoryKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopes.length === 0) {
      setError(t('userCenter.apiKeys.atLeastOneScope'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await apiPost<
        {
          name: string;
          scopes: ApiKeyScope[];
          spaceAccess: SpaceKind[];
          hermesMemory?: { displayName?: string; sharedNamespaceId?: string };
        },
        ApiKeyCreated
      >('/api/api-keys', {
        name,
        scopes,
        spaceAccess,
        ...(isHermesMemoryKey ? {
          hermesMemory: sharedNamespaceId
            ? { sharedNamespaceId }
            : { displayName: name.trim() },
        } : {}),
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-surface p-lg shadow-lg">
        <div className="mb-md flex items-center justify-between gap-md">
          <h3 className="font-display text-xl font-semibold">{t('userCenter.apiKeys.createTitle')}</h3>
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
            <label className={`mb-sm flex items-start gap-sm rounded-md border border-primary/40 bg-primary/5 p-sm ${currentUserIsAdmin ? 'cursor-pointer' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={isHermesMemoryKey}
                onChange={toggleHermesMemory}
                disabled={!currentUserIsAdmin}
                className="mt-1"
              />
              <div className="text-sm">
                <div className="font-medium">{t('userCenter.apiKeys.hermesMemoryPreset')}</div>
                <div className="text-muted text-xs">{t('userCenter.apiKeys.hermesMemoryPresetHint')}</div>
                {!currentUserIsAdmin && <div className="text-warning text-xs">{t('userCenter.apiKeys.spaceAccessAdminOnly')}</div>}
              </div>
            </label>
            <div className="grid grid-cols-1 gap-sm md:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-start gap-sm rounded-md border border-border p-sm cursor-pointer hover:bg-surface-elevated">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={(!currentUserIsAdmin && hermesScopes.includes(scope)) || (isHermesMemoryKey && !hermesScopes.includes(scope))}
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

          {!isHermesMemoryKey && <div>
            <span className="block text-sm font-medium mb-xs">{t('userCenter.apiKeys.spaceAccessLabel')}</span>
            <p className="text-xs text-muted mb-sm">{t('userCenter.apiKeys.spaceAccessHint')}</p>
            <div className="grid grid-cols-1 gap-sm md:grid-cols-3">
              {API_KEY_SPACE_KINDS.map((space) => {
                const disabled = space !== 'wiki' && !currentUserIsAdmin;
                const checked = space === 'wiki' || spaceAccess.includes(space);
                return (
                  <label
                    key={space}
                    className={`flex items-start gap-sm rounded-md border border-border p-sm ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-elevated'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={space === 'wiki' || disabled}
                      onChange={() => toggleSpace(space)}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{t(`userCenter.apiKeys.space.${space}` as never)}</div>
                      <div className="text-muted text-xs">{t(`userCenter.apiKeys.spaceDescriptions.${space}` as never)}</div>
                      {disabled && (
                        <div className="text-warning text-xs">{t('userCenter.apiKeys.spaceAccessAdminOnly')}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>}

          {isHermesMemoryKey && (
            <div className="space-y-sm rounded-md border border-border bg-surface-elevated p-sm text-xs text-muted">
              <p>{t('userCenter.apiKeys.hermesMemoryDestinationHint')}</p>
              <label className="flex items-center gap-sm cursor-pointer">
                <input
                  type="radio"
                  name="hermes-memory-destination"
                  checked={!sharedNamespaceId}
                  onChange={() => setSharedNamespaceId('')}
                />
                {t('userCenter.apiKeys.hermesMemoryNewDestination')}
              </label>
              {hermesDestinations.map((destination) => (
                <label key={destination.id} className="flex items-center gap-sm cursor-pointer">
                  <input
                    type="radio"
                    name="hermes-memory-destination"
                    checked={sharedNamespaceId === destination.id}
                    onChange={() => setSharedNamespaceId(destination.id)}
                  />
                  {t('userCenter.apiKeys.hermesMemorySharedDestination', { name: destination.displayName })}
                </label>
              ))}
            </div>
          )}

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
