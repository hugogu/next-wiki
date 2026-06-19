'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import type { ApiKeyView, ApiKeyCreated, ApiKeyScope } from '@next-wiki/shared';
import { apiGet, apiDelete } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PlusIcon, TrashIcon, EyeIcon } from '@/components/icons';
import { ApiKeyCreateDialog } from './ApiKeyCreateDialog';
import { ApiKeyReveal } from './ApiKeyReveal';

const SCOPE_ORDER: ApiKeyScope[] = ['view', 'create', 'edit', 'delete', 'share', 'run'];

interface ApiKeyListProps {
  initialKeys: ApiKeyView[];
}

export function ApiKeyList({ initialKeys }: ApiKeyListProps) {
  const { t, locale } = useTranslation();
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [revealTitle, setRevealTitle] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyView | null>(null);

  const refresh = async () => {
    const list = await apiGet<ApiKeyView[]>('/api/api-keys');
    setKeys(list);
  };

  const handleCreated = (key: ApiKeyCreated) => {
    setCreatedSecret(key.keySecret);
    refresh();
  };

  const handleReveal = async (key: ApiKeyView) => {
    const result = await apiGet<{ keySecret: string }>(`/api/api-keys/${key.id}/reveal`);
    setRevealTitle(key.name);
    setRevealSecret(result.keySecret);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    setRevokingId(id);
    try {
      await apiDelete(`/api/api-keys/${id}`);
      await refresh();
    } finally {
      setRevokingId(null);
      setRevokeTarget(null);
    }
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString(locale) : '—');

  return (
    <div>
      <div className="flex items-center justify-between mb-lg">
        <h2 className="font-display text-2xl font-semibold">{t('userCenter.apiKeys.title')}</h2>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          <span className="ml-2">{t('userCenter.apiKeys.createButton')}</span>
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="text-muted">{t('userCenter.apiKeys.noKeys')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-left">
              <tr>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.nameLabel')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.scopesLabel')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.keyPrefix')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.createdAt')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.lastUsed')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.statusHeader')}</th>
                <th className="px-md py-sm font-medium">{t('userCenter.apiKeys.actionsHeader')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((key) => {
                const revoked = !!key.revokedAt;
                return (
                  <tr key={key.id} className={revoked ? 'opacity-60' : ''}>
                    <td className="px-md py-sm font-medium">{key.name}</td>
                    <td className="px-md py-sm">
                      <div className="flex flex-wrap gap-xs">
                        {SCOPE_ORDER.filter((s) => key.scopes.includes(s)).map((scope) => (
                          <span
                            key={scope}
                            className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-xs border border-border"
                          >
                            {t(`userCenter.apiKeys.scope.${scope}` as never)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-md py-sm font-mono text-xs">{key.keyPrefix}</td>
                    <td className="px-md py-sm text-muted">{formatDate(key.createdAt)}</td>
                    <td className="px-md py-sm text-muted">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-md py-sm">
                      {revoked ? (
                        <span className="text-danger">{t('userCenter.apiKeys.status.revoked')}</span>
                      ) : (
                        <span className="text-success">{t('userCenter.apiKeys.status.active')}</span>
                      )}
                    </td>
                    <td className="px-md py-sm">
                      <div className="flex items-center gap-sm">
                        {!revoked && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleReveal(key)}
                              title={t('userCenter.apiKeys.reveal')}
                              aria-label={t('userCenter.apiKeys.reveal')}
                            >
                              <EyeIcon />
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              onClick={() => setRevokeTarget(key)}
                              disabled={revokingId === key.id}
                              title={t('userCenter.apiKeys.revoke')}
                              aria-label={t('userCenter.apiKeys.revoke')}
                            >
                              <TrashIcon />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <ApiKeyCreateDialog onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      )}

      {createdSecret && (
        <ApiKeyReveal
          title={t('userCenter.apiKeys.createTitle')}
          secret={createdSecret}
          onClose={() => setCreatedSecret(null)}
        />
      )}

      {revealSecret && (
        <ApiKeyReveal
          title={revealTitle}
          secret={revealSecret}
          onClose={() => {
            setRevealSecret(null);
            setRevealTitle('');
          }}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          title={t('userCenter.apiKeys.revoke')}
          message={`${t('userCenter.apiKeys.revokeConfirm')} ${t('userCenter.apiKeys.revokeWarning')}`}
          confirmLabel={t('userCenter.apiKeys.revoke')}
          confirmVariant="danger"
          pending={revokingId === revokeTarget.id}
          onConfirm={confirmRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
