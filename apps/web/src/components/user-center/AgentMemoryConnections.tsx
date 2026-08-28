'use client';

import { useState } from 'react';
import type { ApiKeyScope } from '@next-wiki/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ApiKeyReveal } from './ApiKeyReveal';

type Connection = {
  connectionId: string;
  agentIdentity: string;
  displayLabel: string;
  state: 'active' | 'disabled' | 'revoked';
  privateDestinationId: string;
};

type Grant = {
  grantId: string;
  destinationId: string;
  capability: 'read' | 'write';
  state: string;
  expiresAt: string | null;
};

const MEMORY_SCOPES: ApiKeyScope[] = ['memory.read', 'memory.write', 'memory.delete'];

export function AgentMemoryConnections({ initialConnections }: { initialConnections: Connection[] }) {
  const [connections, setConnections] = useState(initialConnections);
  const [identity, setIdentity] = useState('');
  const [label, setLabel] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialConnections[0]?.connectionId ?? null);
  const [grantDestination, setGrantDestination] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [grantCapability, setGrantCapability] = useState<'read' | 'write'>('read');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ kind: 'connection' | 'grant'; id: string } | null>(null);

  const selected = connections.find((connection) => connection.connectionId === selectedId) ?? null;

  const refresh = async () => {
    const next = await apiGet<Connection[]>('/api/api-keys/agent-memory/connections');
    setConnections(next);
    if (selectedId && !next.some((connection) => connection.connectionId === selectedId)) {
      setSelectedId(next[0]?.connectionId ?? null);
    }
  };

  const loadGrants = async (connectionId: string) => {
    const [read, write] = await Promise.all([
      apiGet<Grant[]>(`/api/api-keys/agent-memory/connections/${connectionId}/read-grants`),
      apiGet<Grant[]>(`/api/api-keys/agent-memory/connections/${connectionId}/write-grants`),
    ]);
    setGrants([...read, ...write]);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identity.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const connection = await apiPost<{ agentIdentity: string; displayLabel?: string }, Connection>(
        '/api/api-keys/agent-memory/connections',
        { agentIdentity: identity.trim(), displayLabel: label.trim() || undefined },
      );
      setConnections((current) => [connection, ...current]);
      setSelectedId(connection.connectionId);
      setIdentity('');
      setLabel('');
      setMessage('Connection created. Issue a credential before configuring OpenClaw.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create connection');
    } finally {
      setBusy(false);
    }
  };

  const issueCredential = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await apiPost<{ name: string; scopes: ApiKeyScope[] }, { name: string; keySecret: string }>(
        `/api/api-keys/agent-memory/connections/${selected.connectionId}/credentials`,
        { name: `${selected.displayLabel} bridge`, scopes: MEMORY_SCOPES },
      );
      setSecret({ name: result.name, value: result.keySecret });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not issue credential');
    } finally {
      setBusy(false);
    }
  };

  const changeState = async (state: 'active' | 'disabled' | 'revoked') => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await apiPatch<{ state: typeof state }, void>(`/api/api-keys/agent-memory/connections/${selected.connectionId}`, { state });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update connection');
    } finally {
      setBusy(false);
    }
  };

  const addGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !grantDestination.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      await apiPost(
        `/api/api-keys/agent-memory/connections/${selected.connectionId}/${grantCapability}-grants`,
        { destinationId: grantDestination.trim(), capability: grantCapability },
      );
      setGrantDestination('');
      await loadGrants(selected.connectionId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add grant');
    } finally {
      setBusy(false);
    }
  };

  const createSharedDestination = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!destinationName.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const destination = await apiPost<{ displayName: string; role: 'shared' }, { destinationId: string }>(
        '/api/api-keys/agent-memory/destinations',
        { displayName: destinationName.trim(), role: 'shared' },
      );
      setGrantDestination(destination.destinationId);
      setDestinationName('');
      setMessage(`Shared destination created: ${destination.destinationId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create destination');
    } finally {
      setBusy(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/api-keys/agent-memory/grants/${grantId}`);
      if (selected) await loadGrants(selected.connectionId);
      setConfirmAction(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not revoke grant');
    } finally {
      setBusy(false);
    }
  };

  const confirmDestructiveAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.kind === 'grant') {
      await revokeGrant(confirmAction.id);
      return;
    }
    await changeState('revoked');
    setConfirmAction(null);
  };

  return (
    <section className="mb-xl rounded-lg border border-border bg-surface p-lg" aria-labelledby="agent-memory-connections-heading">
      <div className="mb-md">
        <h2 id="agent-memory-connections-heading" className="font-display text-2xl font-semibold">Agent Memory connections</h2>
        <p className="mt-xs text-sm text-muted">Create one stable, private destination per external agent. Sharing is explicit and owner-managed.</p>
      </div>

      <form onSubmit={create} className="mb-lg grid gap-sm md:grid-cols-[1fr_1fr_auto]">
        <Input value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="Agent identity" aria-label="Agent identity" maxLength={100} required />
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Display label (optional)" aria-label="Display label" maxLength={160} />
        <Button type="submit" disabled={busy || !identity.trim()}>Create connection</Button>
      </form>

      {connections.length === 0 ? <p className="text-sm text-muted">No Agent Memory connections yet.</p> : (
        <div className="grid gap-lg lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-xs">
            {connections.map((connection) => (
              <button
                key={connection.connectionId}
                type="button"
                className={`w-full rounded-md border p-sm text-left ${selectedId === connection.connectionId ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => { setSelectedId(connection.connectionId); void loadGrants(connection.connectionId); }}
              >
                <span className="block font-medium">{connection.displayLabel}</span>
                <span className="block text-xs text-muted">{connection.agentIdentity} · {connection.state}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-md">
              <div className="flex flex-wrap items-center gap-sm">
                <Button type="button" onClick={issueCredential} disabled={busy || selected.state !== 'active'}>Issue credential</Button>
                {selected.state === 'active' ? <Button type="button" variant="ghost" onClick={() => void changeState('disabled')} disabled={busy}>Disable</Button> : selected.state === 'disabled' ? <Button type="button" variant="ghost" onClick={() => void changeState('active')} disabled={busy}>Re-enable</Button> : null}
                {selected.state !== 'revoked' && <Button type="button" variant="danger" onClick={() => setConfirmAction({ kind: 'connection', id: selected.connectionId })} disabled={busy}>Revoke connection</Button>}
              </div>

              <form onSubmit={addGrant} className="grid gap-sm md:grid-cols-[1fr_8rem_auto]">
                <Input value={grantDestination} onChange={(event) => setGrantDestination(event.target.value)} placeholder="Shared destination ID" aria-label="Shared destination ID" />
                <Select value={grantCapability} onChange={(event) => setGrantCapability(event.target.value as 'read' | 'write')} aria-label="Grant capability">
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                </Select>
                <Button type="submit" disabled={busy || !grantDestination.trim()}>Grant</Button>
              </form>
              <form onSubmit={createSharedDestination} className="grid gap-sm md:grid-cols-[1fr_auto]">
                <Input value={destinationName} onChange={(event) => setDestinationName(event.target.value)} placeholder="Create shared destination" aria-label="New shared destination name" maxLength={160} />
                <Button type="submit" variant="ghost" disabled={busy || !destinationName.trim()}>Create shared destination</Button>
              </form>

              {grants.length > 0 && <ul className="space-y-xs text-sm">
                {grants.map((grant) => (
                  <li key={grant.grantId} className="flex items-center justify-between gap-sm rounded border border-border p-xs">
                    <span className="truncate"><code>{grant.destinationId}</code> · {grant.capability} · {grant.state}</span>
                    {grant.state === 'active' && <Button type="button" variant="ghost" onClick={() => setConfirmAction({ kind: 'grant', id: grant.grantId })} disabled={busy}>Revoke</Button>}
                  </li>
                ))}
              </ul>}
            </div>
          )}
        </div>
      )}

      {message && <p className="mt-md text-sm text-danger" role="status">{message}</p>}
      {confirmAction && <ConfirmDialog
        title={confirmAction.kind === 'connection' ? 'Revoke Agent Memory connection' : 'Revoke Agent Memory grant'}
        message="This action stops future access immediately. Existing immutable Raw revisions are retained."
        confirmLabel="Revoke"
        confirmVariant="danger"
        pending={busy}
        onConfirm={() => void confirmDestructiveAction()}
        onCancel={() => setConfirmAction(null)}
      />}
      {secret && <ApiKeyReveal title="Agent Memory credential" name={secret.name} secret={secret.value} created onClose={() => setSecret(null)} />}
    </section>
  );
}
