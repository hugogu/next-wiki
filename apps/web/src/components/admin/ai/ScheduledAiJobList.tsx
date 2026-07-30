'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ScheduledAiJobView, ScheduledAiJobRunView } from '@next-wiki/shared';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from '@/components/ui/DataTable';

type Props = { jobs: ScheduledAiJobView[]; runs: ScheduledAiJobRunView[] };

export function ScheduledAiJobList({ jobs, runs }: Props) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const tab = search.get('tab') === 'runs' ? 'runs' : 'jobs';
  const select = (value: 'jobs' | 'runs') => { const params = new URLSearchParams(search.toString()); params.set('tab', value); router.replace(`${pathname}?${params}`); };
  return <SettingsTabs tabs={[{ id: 'jobs', label: 'Jobs' }, { id: 'runs', label: 'Runs' }]} selected={tab} onSelect={select}>
    {tab === 'jobs' ? <DataTable><DataTableHead><DataTableRow><DataTableHeader>Name</DataTableHeader><DataTableHeader>Status</DataTableHeader><DataTableHeader>Schedule</DataTableHeader><DataTableHeader>Next run</DataTableHeader></DataTableRow></DataTableHead><DataTableBody>
      {jobs.map((job) => <DataTableRow key={job.id}><DataTableCell><Link className="text-primary hover:underline" href={`/admin/ai/jobs/${job.id}`}>{job.name}</Link></DataTableCell><DataTableCell>{job.status}</DataTableCell><DataTableCell>{job.scheduleCron} · {job.timeZone}</DataTableCell><DataTableCell>{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}</DataTableCell></DataTableRow>)}
      {!jobs.length && <DataTableRow><DataTableCell colSpan={4} className="text-muted">No scheduled AI jobs yet.</DataTableCell></DataTableRow>}
    </DataTableBody></DataTable> : <DataTable><DataTableHead><DataTableRow><DataTableHeader>Run</DataTableHeader><DataTableHeader>Status</DataTableHeader><DataTableHeader>Trigger</DataTableHeader><DataTableHeader>Queued</DataTableHeader></DataTableRow></DataTableHead><DataTableBody>
      {runs.map((run) => <DataTableRow key={run.id}><DataTableCell><Link className="text-primary hover:underline" href={`/admin/ai/jobs/${run.jobId}/runs/${run.id}`}>{run.id.slice(0, 8)}</Link></DataTableCell><DataTableCell>{run.status}</DataTableCell><DataTableCell>{run.trigger}</DataTableCell><DataTableCell>{run.scheduledFor || run.startedAt ? new Date(run.scheduledFor ?? run.startedAt!).toLocaleString() : '—'}</DataTableCell></DataTableRow>)}
      {!runs.length && <DataTableRow><DataTableCell colSpan={4} className="text-muted">No scheduled AI runs yet.</DataTableCell></DataTableRow>}
    </DataTableBody></DataTable>}
  </SettingsTabs>;
}
