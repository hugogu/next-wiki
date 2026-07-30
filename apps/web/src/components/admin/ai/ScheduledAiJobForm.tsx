'use client';

import { useState } from 'react';
import type { ScheduledAiJobView } from '@next-wiki/shared';
import { apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

function ids(value: string) { return value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean); }

export function ScheduledAiJobForm({ initial, onCancel, onSaved }: { initial?: ScheduledAiJobView; onCancel: () => void; onSaved: (job: ScheduledAiJobView) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [taskDescription, setTaskDescription] = useState(initial?.taskDescription ?? '');
  const [scheduleCron, setScheduleCron] = useState(initial?.scheduleCron ?? '0 3 * * *');
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
  const [spaceIds, setSpaceIds] = useState(initial?.targetScope.spaceIds.join(', ') ?? '');
  const [rootPageIds, setRootPageIds] = useState(initial?.targetScope.rootPageIds.join(', ') ?? '');
  const [tagIds, setTagIds] = useState(initial?.targetScope.tagIds.join(', ') ?? '');
  const [runAsUserId, setRunAsUserId] = useState(initial?.runAsUserId ?? '');
  const [enabled, setEnabled] = useState(initial?.status === 'enabled');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  return <form className="space-y-md" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(null); const body = { name, taskDescription, scheduleCron, timeZone, targetScope: { spaceIds: ids(spaceIds), rootPageIds: ids(rootPageIds), tagIds: ids(tagIds) }, runAsUserId, status: enabled ? 'enabled' as const : 'paused' as const }; try { const job = initial ? await apiPatch<typeof body, ScheduledAiJobView>(`/api/ai/scheduled-jobs/${initial.id}`, body) : await apiPost<typeof body, ScheduledAiJobView>('/api/ai/scheduled-jobs', body); onSaved(job); } catch (value) { setError((value as ApiError).message ?? 'Unable to save scheduled AI job.'); } finally { setSaving(false); } }}>
    {error && <Alert>{error}</Alert>}
    <label className="block space-y-xs"><span className="text-sm font-medium">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} /></label>
    <label className="block space-y-xs"><span className="text-sm font-medium">Task description</span><textarea className="min-h-32 w-full rounded-md border border-border bg-surface px-md py-sm text-sm" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} required maxLength={12000} placeholder="Describe the AI maintenance task and required reviewable outcome." /></label>
    <div className="grid gap-md sm:grid-cols-2"><label className="block space-y-xs"><span className="text-sm font-medium">Cron schedule</span><Input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} required /><span className="text-xs text-muted">Five fields, e.g. 0 3 * * *</span></label><label className="block space-y-xs"><span className="text-sm font-medium">Time zone</span><Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required /></label></div>
    <label className="block space-y-xs"><span className="text-sm font-medium">Allowed space IDs</span><Input value={spaceIds} onChange={(e) => setSpaceIds(e.target.value)} placeholder="UUID, UUID" /><span className="text-xs text-muted">Provide spaces or root pages. IDs are comma-separated.</span></label>
    <label className="block space-y-xs"><span className="text-sm font-medium">Allowed root page IDs</span><Input value={rootPageIds} onChange={(e) => setRootPageIds(e.target.value)} placeholder="UUID, UUID" /></label>
    <label className="block space-y-xs"><span className="text-sm font-medium">Allowed tag IDs</span><Input value={tagIds} onChange={(e) => setTagIds(e.target.value)} placeholder="UUID, UUID" /></label>
    <label className="block space-y-xs"><span className="text-sm font-medium">Execution owner ID</span><Input value={runAsUserId} onChange={(e) => setRunAsUserId(e.target.value)} required /></label>
    <label className="flex items-center gap-sm text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable after saving</label>
    <div className="flex justify-end gap-sm"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create job'}</Button></div>
  </form>;
}
