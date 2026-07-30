'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScheduledAiJobRunView, ScheduledAiJobView } from '@next-wiki/shared';
import { apiDelete, apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ScheduledAiJobForm } from './ScheduledAiJobForm';

export function ScheduledAiJobDetail({ job, runs }: { job: ScheduledAiJobView; runs: ScheduledAiJobRunView[] }) {
  const router = useRouter(); const [editing, setEditing] = useState(false); const [confirm, setConfirm] = useState<'retire' | string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const act = async (name: string, callback: () => Promise<unknown>) => { setBusy(name); setError(null); try { await callback(); router.refresh(); } catch (value) { setError((value as ApiError).message ?? 'Operation failed.'); } finally { setBusy(null); } };
  const confirmAction = () => { if (confirm === 'retire') void act('retire', () => apiDelete(`/api/ai/scheduled-jobs/${job.id}`)); else if (confirm) void act('cancel', () => apiPost(`/api/ai/scheduled-jobs/${job.id}/runs/${confirm}/cancel`, {})); setConfirm(null); };
  return <><div className="flex flex-wrap gap-sm"><Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button><Button variant="secondary" disabled={busy !== null} onClick={() => act('toggle', () => apiPatch(`/api/ai/scheduled-jobs/${job.id}`, { status: job.status === 'enabled' ? 'paused' : 'enabled' }))}>{job.status === 'enabled' ? 'Pause' : 'Resume'}</Button><Button disabled={busy !== null} onClick={() => act('run', () => apiPost(`/api/ai/scheduled-jobs/${job.id}/runs`, {}))}>Run now</Button><Button variant="secondary" disabled={busy !== null} onClick={() => act('duplicate', () => apiPost(`/api/ai/scheduled-jobs/${job.id}/duplicate`, {}))}>Duplicate</Button><Button variant="danger" disabled={busy !== null || job.status === 'retired'} onClick={() => setConfirm('retire')}>Retire</Button></div>{error && <div className="mt-md"><Alert>{error}</Alert></div>}<ul className="mt-md space-y-xs">{runs.filter((run) => run.status === 'queued' || run.status === 'running').map((run) => <li key={run.id} className="flex items-center gap-sm text-sm"><span>{run.status} · {run.id.slice(0, 8)}</span><Button size="icon" variant="ghost" aria-label="Cancel run" disabled={busy !== null} onClick={() => setConfirm(run.id)}>×</Button></li>)}</ul>{editing && <ModalDialog title="Edit scheduled AI job" onClose={() => setEditing(false)}><ScheduledAiJobForm initial={job} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} /></ModalDialog>}{confirm && <ModalDialog title={confirm === 'retire' ? 'Retire scheduled AI job?' : 'Cancel scheduled AI run?'} description={confirm === 'retire' ? 'The job history is preserved and active work is asked to stop.' : 'Completed proposals and drafts are not changed.'} onClose={() => setConfirm(null)}><div className="flex justify-end gap-sm"><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={confirmAction}>Confirm</Button></div></ModalDialog>}</>;
}
