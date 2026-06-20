'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import type { ApiKeyView, ApiKeyCreated, ApiKeyScope } from '@next-wiki/shared';
import { apiGet, apiDelete } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PlusIcon, TrashIcon, EyeIcon } from '@/components/icons';
import { ApiKeyCreateDialog } from './ApiKeyCreateDialog';
import { ApiKeyReveal } from './ApiKeyReveal';

const SCOPE_ORDER: ApiKeyScope[] = ['view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences'];

interface ApiKeyListProps {
  initialKeys: ApiKeyView[];
}

export function ApiKeyList({ initialKeys }: ApiKeyListProps) {
  const { t, locale } = useTranslation();
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [revealTitle, setRevealTitle] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyView | null>(null);
  const [revokeError, setRevokeError] = useState('');

  const refresh = async () => {
    const list = await apiGet<ApiKeyView[]>('/api/api-keys');
    setKeys(list);
  };

  const handleCreated = (key: ApiKeyCreated) => {
    setCreatedKey(key);
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
    setRevokeError('');
    setRevokingId(id);
    try {
      await apiDelete(`/api/api-keys/${id}`);
      await refresh();
      setRevokeTarget(null);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('userCenter.apiKeys.revokeFailed');
      setRevokeError(message);
    } finally {
      setRevokingId(null);
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
        <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeader>{t('userCenter.apiKeys.nameLabel')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.scopesLabel')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.keyPrefix')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.createdAt')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.lastUsed')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.statusHeader')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.actionsHeader')}</DataTableHeader>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {keys.map((key) => {
                const revoked = !!key.revokedAt;
                return (
                  <DataTableRow key={key.id} className={revoked ? 'opacity-60' : ''}>
                    <DataTableCell className="font-medium">{key.name}</DataTableCell>
                    <DataTableCell>
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
                    </DataTableCell>
                    <DataTableCell className="font-mono text-xs">{key.keyPrefix}</DataTableCell>
                    <DataTableCell className="text-muted">{formatDate(key.createdAt)}</DataTableCell>
                    <DataTableCell className="text-muted">{formatDate(key.lastUsedAt)}</DataTableCell>
                    <DataTableCell>
                      {revoked ? (
                        <span className="text-danger">{t('userCenter.apiKeys.status.revoked')}</span>
                      ) : (
                        <span className="text-success">{t('userCenter.apiKeys.status.active')}</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>
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
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
        </DataTable>
      )}

      {createOpen && (
        <ApiKeyCreateDialog onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      )}

      {createdKey && (
        <ApiKeyReveal
          title={t('userCenter.apiKeys.createdTitle')}
          name={createdKey.name}
          secret={createdKey.keySecret}
          created
          onClose={() => setCreatedKey(null)}
        />
      )}

      {revealSecret && (
        <ApiKeyReveal
          title={t('userCenter.apiKeys.revealTitle')}
          name={revealTitle}
          secret={revealSecret}
          onClose={() => {
            setRevealSecret(null);
            setRevealTitle('');
          }}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          title={t('userCenter.apiKeys.revokeTitle')}
          message={`${t('userCenter.apiKeys.revokeConfirm')} ${t('userCenter.apiKeys.revokeWarning')}`}
          confirmLabel={t('userCenter.apiKeys.revoke')}
          confirmVariant="danger"
          pending={revokingId === revokeTarget.id}
          error={revokeError}
          onConfirm={confirmRevoke}
          onCancel={() => {
            setRevokeTarget(null);
            setRevokeError('');
          }}
        />
      )}
    </div>
  );
}
