'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/client';
import type { AgentMemoryConnectionSummary } from '@next-wiki/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PlusIcon, TrashIcon, RefreshIcon, XIcon } from '@/components/icons';
import { ApiKeyReveal } from './ApiKeyReveal';

interface AgentMemoryConnectionsProps {
  onConnectionsChanged?: (connections: AgentMemoryConnectionSummary[]) => void;
}

type PendingSecret = { title: string; name: string; secret: string };

export function AgentMemoryConnections({ onConnectionsChanged }: AgentMemoryConnectionsProps) {
  const { t, locale } = useTranslation();
  const [connections, setConnections] = useState<AgentMemoryConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [agentIdentity, setAgentIdentity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [pendingSecret, setPendingSecret] = useState<PendingSecret | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AgentMemoryConnectionSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const refresh = async () => {
    const list = await apiGet<AgentMemoryConnectionSummary[]>('/api/api-keys/agent-memory/connections');
    setConnections(list);
    onConnectionsChanged?.(list);
  };

  useEffect(() => {
    let cancelled = false;
    apiGet<AgentMemoryConnectionSummary[]>('/api/api-keys/agent-memory/connections')
      .then((list) => {
        if (cancelled) return;
        setConnections(list);
        onConnectionsChanged?.(list);
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setCreateError('');
    try {
      const result = await apiPost<
        { displayName: string; agentIdentity?: string },
        { connection: AgentMemoryConnectionSummary; keyId: string; keySecret: string }
      >('/api/api-keys/agent-memory/connections', {
        displayName,
        ...(agentIdentity.trim() ? { agentIdentity: agentIdentity.trim() } : {}),
      });
      setPendingSecret({ title: t('userCenter.agentMemory.connections.createdTitle'), name: result.connection.displayName, secret: result.keySecret });
      setDisplayName('');
      setAgentIdentity('');
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.connections.createFailed');
      setCreateError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotate = async (connection: AgentMemoryConnectionSummary) => {
    setBusyId(connection.connectionId);
    setActionError('');
    try {
      const result = await apiPost<void, { keyId: string; keySecret: string }>(
        `/api/api-keys/agent-memory/connections/${connection.connectionId}/rotate`,
        undefined,
      );
      setPendingSecret({ title: t('userCenter.agentMemory.connections.rotatedTitle'), name: connection.displayName, secret: result.keySecret });
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.connections.rotateFailed');
      setActionError(message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDisable = async (connection: AgentMemoryConnectionSummary) => {
    setBusyId(connection.connectionId);
    setActionError('');
    try {
      await apiPatch(`/api/api-keys/agent-memory/connections/${connection.connectionId}`, { state: 'disabled' });
      await refresh();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.connections.disableFailed');
      setActionError(message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.connectionId);
    setActionError('');
    try {
      await apiDelete(`/api/api-keys/agent-memory/connections/${revokeTarget.connectionId}`);
      setRevokeTarget(null);
      await refresh();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.connections.revokeFailed');
      setActionError(message);
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  const stateLabel = (state: AgentMemoryConnectionSummary['state']) => {
    if (state === 'active') return <span className="text-success">{t('userCenter.agentMemory.connections.state.active')}</span>;
    if (state === 'disabled') return <span className="text-warning">{t('userCenter.agentMemory.connections.state.disabled')}</span>;
    return <span className="text-danger">{t('userCenter.agentMemory.connections.state.revoked')}</span>;
  };

  return (
    <section className="mt-2xl">
      <div className="flex items-center justify-between mb-lg">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t('userCenter.agentMemory.connections.title')}</h2>
          <p className="text-sm text-muted mt-1">{t('userCenter.agentMemory.connections.description')}</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          <span className="ml-2">{t('userCenter.agentMemory.connections.createButton')}</span>
        </Button>
      </div>

      {actionError && <p className="mb-sm text-sm text-danger">{actionError}</p>}

      {loading ? (
        <p className="text-muted">{t('common.status.loading')}</p>
      ) : connections.length === 0 ? (
        <p className="text-muted">{t('userCenter.agentMemory.connections.empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeader>{t('userCenter.agentMemory.connections.nameLabel')}</DataTableHeader>
              <DataTableHeader>{t('userCenter.agentMemory.connections.agentIdentityLabel')}</DataTableHeader>
              <DataTableHeader>{t('userCenter.apiKeys.createdAt')}</DataTableHeader>
              <DataTableHeader>{t('userCenter.apiKeys.statusHeader')}</DataTableHeader>
              <DataTableHeader>{t('userCenter.apiKeys.actionsHeader')}</DataTableHeader>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {connections.map((connection) => (
              <DataTableRow key={connection.connectionId} className={connection.state !== 'active' ? 'opacity-60' : ''}>
                <DataTableCell className="font-medium">{connection.displayName}</DataTableCell>
                <DataTableCell className="font-mono text-xs">{connection.agentIdentity}</DataTableCell>
                <DataTableCell className="text-muted">{formatDate(connection.createdAt)}</DataTableCell>
                <DataTableCell>{stateLabel(connection.state)}</DataTableCell>
                <DataTableCell>
                  <div className="flex items-center gap-sm">
                    {connection.state === 'active' && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRotate(connection)}
                          disabled={busyId === connection.connectionId}
                          title={t('userCenter.agentMemory.connections.rotate')}
                          aria-label={t('userCenter.agentMemory.connections.rotate')}
                        >
                          <RefreshIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleDisable(connection)}
                          disabled={busyId === connection.connectionId}
                        >
                          {t('userCenter.agentMemory.connections.disable')}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => setRevokeTarget(connection)}
                          disabled={busyId === connection.connectionId}
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
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-lg shadow-lg">
            <div className="mb-md flex items-center justify-between gap-md">
              <h3 className="font-display text-xl font-semibold">{t('userCenter.agentMemory.connections.createTitle')}</h3>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="h-9 w-9 px-0" aria-label={t('common.actions.dismiss')} title={t('common.actions.dismiss')}>
                <XIcon />
              </Button>
            </div>
            <form onSubmit={handleCreate} className="space-y-md">
              <div>
                <label htmlFor="connection-name" className="block text-sm font-medium mb-xs">{t('userCenter.agentMemory.connections.nameLabel')}</label>
                <Input id="connection-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} maxLength={160} placeholder={t('userCenter.agentMemory.connections.namePlaceholder')} />
              </div>
              <div>
                <label htmlFor="connection-agent-identity" className="block text-sm font-medium mb-xs">{t('userCenter.agentMemory.connections.agentIdentityLabel')}</label>
                <Input id="connection-agent-identity" value={agentIdentity} onChange={(e) => setAgentIdentity(e.target.value)} maxLength={100} placeholder={t('userCenter.agentMemory.connections.agentIdentityPlaceholder')} />
                <p className="mt-xs text-xs text-muted">{t('userCenter.agentMemory.connections.agentIdentityHint')}</p>
              </div>
              {createError && <p className="text-sm text-danger">{createError}</p>}
              <div className="flex justify-end gap-sm">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>{t('common.actions.cancel')}</Button>
                <Button type="submit" disabled={submitting || !displayName.trim()}>
                  {submitting ? t('userCenter.profile.savingButton') : t('userCenter.agentMemory.connections.createButton')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingSecret && (
        <ApiKeyReveal
          title={pendingSecret.title}
          name={pendingSecret.name}
          secret={pendingSecret.secret}
          warningText={t('userCenter.agentMemory.connections.secretWarning')}
          onClose={() => setPendingSecret(null)}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          title={t('userCenter.agentMemory.connections.revokeTitle')}
          message={`${t('userCenter.agentMemory.connections.revokeConfirm')} ${t('userCenter.agentMemory.connections.revokeWarning')}`}
          confirmLabel={t('userCenter.apiKeys.revoke')}
          confirmVariant="danger"
          pending={busyId === revokeTarget.connectionId}
          onConfirm={confirmRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </section>
  );
}
