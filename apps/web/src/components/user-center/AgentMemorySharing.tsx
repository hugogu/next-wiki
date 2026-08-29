'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/client';
import type {
  AgentMemoryConnectionSummary,
  AgentMemoryDestinationGrant,
  AgentMemoryRecord,
  AgentMemorySharedDestination,
} from '@next-wiki/shared';
import { apiGet, apiPost, apiDelete } from '@/lib/api/client';
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
import { PlusIcon, TrashIcon } from '@/components/icons';

export function AgentMemorySharing() {
  const { t, locale } = useTranslation();
  const [destinations, setDestinations] = useState<AgentMemorySharedDestination[]>([]);
  const [grants, setGrants] = useState<AgentMemoryDestinationGrant[]>([]);
  const [connections, setConnections] = useState<AgentMemoryConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<AgentMemoryDestinationGrant | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newDestinationName, setNewDestinationName] = useState('');
  const [creatingDestination, setCreatingDestination] = useState(false);

  const [grantDestinationId, setGrantDestinationId] = useState('');
  const [grantConnectionId, setGrantConnectionId] = useState('');
  const [creatingGrant, setCreatingGrant] = useState(false);

  const [promoteRecordId, setPromoteRecordId] = useState('');
  const [promoteDestinationId, setPromoteDestinationId] = useState('');
  const [promoteTitle, setPromoteTitle] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<AgentMemoryRecord | null>(null);

  const refresh = async () => {
    const [destinationList, grantList, connectionList] = await Promise.all([
      apiGet<AgentMemorySharedDestination[]>('/api/api-keys/agent-memory/shared-destinations'),
      apiGet<AgentMemoryDestinationGrant[]>('/api/api-keys/agent-memory/read-grants'),
      apiGet<AgentMemoryConnectionSummary[]>('/api/api-keys/agent-memory/connections'),
    ]);
    setDestinations(destinationList);
    setGrants(grantList);
    setConnections(connectionList);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<AgentMemorySharedDestination[]>('/api/api-keys/agent-memory/shared-destinations'),
      apiGet<AgentMemoryDestinationGrant[]>('/api/api-keys/agent-memory/read-grants'),
      apiGet<AgentMemoryConnectionSummary[]>('/api/api-keys/agent-memory/connections'),
    ])
      .then(([destinationList, grantList, connectionList]) => {
        if (cancelled) return;
        setDestinations(destinationList);
        setGrants(grantList);
        setConnections(connectionList);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const destinationName = (id: string) => destinations.find((d) => d.id === id)?.displayName ?? id;
  const connectionName = (id: string) => connections.find((c) => c.connectionId === id)?.displayName ?? id;
  const activeConnections = connections.filter((c) => c.state === 'active');
  const activeDestinations = destinations.filter((d) => d.state === 'active');

  const handleCreateDestination = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingDestination(true);
    setActionError('');
    try {
      await apiPost<{ displayName: string }, AgentMemorySharedDestination>('/api/api-keys/agent-memory/shared-destinations', { displayName: newDestinationName });
      setNewDestinationName('');
      await refresh();
    } catch (err) {
      setActionError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.sharing.createDestinationFailed'));
    } finally {
      setCreatingDestination(false);
    }
  };

  const handleCreateGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!grantDestinationId || !grantConnectionId) return;
    setCreatingGrant(true);
    setActionError('');
    try {
      await apiPost<{ destinationId: string }, AgentMemoryDestinationGrant>(
        `/api/api-keys/agent-memory/connections/${grantConnectionId}/read-grants`,
        { destinationId: grantDestinationId },
      );
      setGrantDestinationId('');
      setGrantConnectionId('');
      await refresh();
    } catch (err) {
      setActionError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.sharing.createGrantFailed'));
    } finally {
      setCreatingGrant(false);
    }
  };

  const confirmRevokeGrant = async () => {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.grantId);
    setActionError('');
    try {
      await apiDelete(`/api/api-keys/agent-memory/connections/${revokeTarget.granteeConnectionId}/read-grants/${revokeTarget.grantId}`);
      setRevokeTarget(null);
      await refresh();
    } catch (err) {
      setActionError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.sharing.revokeGrantFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handlePromote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!promoteRecordId.trim() || !promoteDestinationId) return;
    setPromoting(true);
    setActionError('');
    setPromoteResult(null);
    try {
      const result = await apiPost<
        { sourceRecordId: string; destinationId: string; title?: string },
        { record: AgentMemoryRecord }
      >('/api/api-keys/agent-memory/promotions', {
        sourceRecordId: promoteRecordId.trim(),
        destinationId: promoteDestinationId,
        ...(promoteTitle.trim() ? { title: promoteTitle.trim() } : {}),
      });
      setPromoteResult(result.record);
      setPromoteRecordId('');
      setPromoteTitle('');
    } catch (err) {
      setActionError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : t('userCenter.agentMemory.sharing.promoteFailed'));
    } finally {
      setPromoting(false);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  if (loading) {
    return <p className="mt-2xl text-muted">{t('common.status.loading')}</p>;
  }

  return (
    <section className="mt-2xl space-y-2xl">
      <div>
        <h2 className="font-display text-2xl font-semibold">{t('userCenter.agentMemory.sharing.title')}</h2>
        <p className="text-sm text-muted mt-1">{t('userCenter.agentMemory.sharing.description')}</p>
      </div>

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      {/* Shared destinations */}
      <div>
        <h3 className="font-display text-lg font-semibold mb-sm">{t('userCenter.agentMemory.sharing.destinationsTitle')}</h3>
        {destinations.length === 0 ? (
          <p className="text-muted text-sm mb-sm">{t('userCenter.agentMemory.sharing.noDestinations')}</p>
        ) : (
          <ul className="mb-sm space-y-xs text-sm">
            {destinations.map((destination) => (
              <li key={destination.id} className="flex items-center gap-sm">
                <span className="font-medium">{destination.displayName}</span>
                <span className="text-xs text-muted">({destination.state})</span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleCreateDestination} className="flex items-end gap-sm">
          <div className="flex-1">
            <label htmlFor="shared-destination-name" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.newDestinationLabel')}</label>
            <Input id="shared-destination-name" value={newDestinationName} onChange={(e) => setNewDestinationName(e.target.value)} minLength={1} maxLength={160} placeholder={t('userCenter.agentMemory.sharing.newDestinationPlaceholder')} />
          </div>
          <Button type="submit" disabled={creatingDestination || !newDestinationName.trim()}>
            <PlusIcon />
            <span className="ml-2">{t('userCenter.agentMemory.sharing.createDestinationButton')}</span>
          </Button>
        </form>
      </div>

      {/* Read grants */}
      <div>
        <h3 className="font-display text-lg font-semibold mb-sm">{t('userCenter.agentMemory.sharing.grantsTitle')}</h3>
        {grants.length === 0 ? (
          <p className="text-muted text-sm mb-sm">{t('userCenter.agentMemory.sharing.noGrants')}</p>
        ) : (
          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeader>{t('userCenter.agentMemory.sharing.grantConnectionHeader')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.agentMemory.sharing.grantDestinationHeader')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.statusHeader')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.createdAt')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.apiKeys.actionsHeader')}</DataTableHeader>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {grants.map((grant) => (
                <DataTableRow key={grant.grantId} className={grant.state !== 'active' ? 'opacity-60' : ''}>
                  <DataTableCell>{connectionName(grant.granteeConnectionId)}</DataTableCell>
                  <DataTableCell>{destinationName(grant.destinationId)}</DataTableCell>
                  <DataTableCell>{grant.state}</DataTableCell>
                  <DataTableCell className="text-muted">{formatDate(grant.createdAt)}</DataTableCell>
                  <DataTableCell>
                    {grant.state === 'active' && (
                      <Button type="button" variant="danger" onClick={() => setRevokeTarget(grant)} disabled={busyId === grant.grantId} aria-label={t('userCenter.agentMemory.sharing.revokeGrant')} title={t('userCenter.agentMemory.sharing.revokeGrant')}>
                        <TrashIcon />
                      </Button>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
        <form onSubmit={handleCreateGrant} className="mt-sm flex flex-wrap items-end gap-sm">
          <div>
            <label htmlFor="grant-connection" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.grantConnectionHeader')}</label>
            <select id="grant-connection" value={grantConnectionId} onChange={(e) => setGrantConnectionId(e.target.value)} className="rounded-md border border-border bg-surface px-sm py-1.5 text-sm">
              <option value="">{t('userCenter.agentMemory.sharing.selectPlaceholder')}</option>
              {activeConnections.map((connection) => (
                <option key={connection.connectionId} value={connection.connectionId}>{connection.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="grant-destination" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.grantDestinationHeader')}</label>
            <select id="grant-destination" value={grantDestinationId} onChange={(e) => setGrantDestinationId(e.target.value)} className="rounded-md border border-border bg-surface px-sm py-1.5 text-sm">
              <option value="">{t('userCenter.agentMemory.sharing.selectPlaceholder')}</option>
              {activeDestinations.map((destination) => (
                <option key={destination.id} value={destination.id}>{destination.displayName}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={creatingGrant || !grantConnectionId || !grantDestinationId}>
            <PlusIcon />
            <span className="ml-2">{t('userCenter.agentMemory.sharing.createGrantButton')}</span>
          </Button>
        </form>
      </div>

      {/* Promotion */}
      <div>
        <h3 className="font-display text-lg font-semibold mb-sm">{t('userCenter.agentMemory.sharing.promoteTitle')}</h3>
        <p className="text-xs text-muted mb-sm">{t('userCenter.agentMemory.sharing.promoteHint')}</p>
        <form onSubmit={handlePromote} className="flex flex-wrap items-end gap-sm">
          <div>
            <label htmlFor="promote-record-id" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.promoteRecordIdLabel')}</label>
            <Input id="promote-record-id" value={promoteRecordId} onChange={(e) => setPromoteRecordId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
          </div>
          <div>
            <label htmlFor="promote-destination" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.grantDestinationHeader')}</label>
            <select id="promote-destination" value={promoteDestinationId} onChange={(e) => setPromoteDestinationId(e.target.value)} className="rounded-md border border-border bg-surface px-sm py-1.5 text-sm">
              <option value="">{t('userCenter.agentMemory.sharing.selectPlaceholder')}</option>
              {activeDestinations.map((destination) => (
                <option key={destination.id} value={destination.id}>{destination.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="promote-title" className="block text-xs font-medium mb-xs">{t('userCenter.agentMemory.sharing.promoteTitleLabel')}</label>
            <Input id="promote-title" value={promoteTitle} onChange={(e) => setPromoteTitle(e.target.value)} maxLength={160} />
          </div>
          <Button type="submit" disabled={promoting || !promoteRecordId.trim() || !promoteDestinationId}>
            {promoting ? t('userCenter.profile.savingButton') : t('userCenter.agentMemory.sharing.promoteButton')}
          </Button>
        </form>
        {promoteResult && (
          <p className="mt-sm text-sm text-success">
            {t('userCenter.agentMemory.sharing.promoteSuccess', { title: promoteResult.title })}
          </p>
        )}
      </div>

      {revokeTarget && (
        <ConfirmDialog
          title={t('userCenter.agentMemory.sharing.revokeGrantTitle')}
          message={t('userCenter.agentMemory.sharing.revokeGrantConfirm')}
          confirmLabel={t('userCenter.agentMemory.sharing.revokeGrant')}
          confirmVariant="danger"
          pending={busyId === revokeTarget.grantId}
          onConfirm={confirmRevokeGrant}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </section>
  );
}
