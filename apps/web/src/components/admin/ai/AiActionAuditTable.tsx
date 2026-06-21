'use client';

import { useMemo, useState } from 'react';
import type { AiActionView } from '@next-wiki/shared';
import { Select } from '@/components/ui/Select';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';

export function AiActionAuditTable({ actions }: { actions: AiActionView[] }) {
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState('');
  const [user, setUser] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(
    () => actions.filter((action) => {
      const queued = new Date(action.queuedAt).getTime();
      return (!feature || action.feature === feature)
        && (!status || action.status === status)
        && (!user || action.actorUserId?.includes(user))
        && (!provider || action.providerName?.toLowerCase().includes(provider.toLowerCase()))
        && (!model || action.modelName?.toLowerCase().includes(model.toLowerCase()))
        && (!from || queued >= new Date(from).getTime())
        && (!to || queued <= new Date(`${to}T23:59:59.999`).getTime());
    }),
    [actions, feature, from, model, provider, status, to, user],
  );
  return (
    <div className="space-y-md">
      <div>
        <h1 className="font-display text-xl font-semibold">AI actions</h1>
        <p className="text-sm text-muted">Operational metadata only. Prompts, responses, selections, and image bytes are not retained here.</p>
      </div>
      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
        <Select value={feature} onChange={(event) => setFeature(event.target.value)}>
          <option value="">All features</option>
          {[...new Set(actions.map((action) => action.feature))].map((value) => <option key={value}>{value}</option>)}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {[...new Set(actions.map((action) => action.status))].map((value) => <option key={value}>{value}</option>)}
        </Select>
        <input className="rounded-md border border-border bg-surface px-md py-sm text-sm" value={user} onChange={(event) => setUser(event.target.value)} placeholder="User id" />
        <input className="rounded-md border border-border bg-surface px-md py-sm text-sm" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Provider" />
        <input className="rounded-md border border-border bg-surface px-md py-sm text-sm" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" />
        <input type="date" className="rounded-md border border-border bg-surface px-md py-sm text-sm" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
        <input type="date" className="rounded-md border border-border bg-surface px-md py-sm text-sm" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
      </div>
      <DataTable>
        <DataTableHead><DataTableRow>
          <DataTableHeader>Queued</DataTableHeader>
          <DataTableHeader>Feature</DataTableHeader>
          <DataTableHeader>Status</DataTableHeader>
          <DataTableHeader>User</DataTableHeader>
          <DataTableHeader>Provider / model</DataTableHeader>
          <DataTableHeader>Error</DataTableHeader>
        </DataTableRow></DataTableHead>
        <DataTableBody>
          {filtered.map((action) => <DataTableRow key={action.id}>
            <DataTableCell>{new Date(action.queuedAt).toLocaleString()}</DataTableCell>
            <DataTableCell>{action.feature}</DataTableCell>
            <DataTableCell>{action.status}</DataTableCell>
            <DataTableCell className="font-mono text-xs">{action.actorUserId ?? 'system'}</DataTableCell>
            <DataTableCell>{[action.providerName, action.modelName].filter(Boolean).join(' / ') || '—'}</DataTableCell>
            <DataTableCell>{action.errorCode ?? '—'}</DataTableCell>
          </DataTableRow>)}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
