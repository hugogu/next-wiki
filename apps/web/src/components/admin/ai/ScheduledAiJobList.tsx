'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ScheduledAiJobView, ScheduledAiJobRunView } from '@next-wiki/shared';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ScheduledAiJobForm, type ScheduledAiJobOptions } from './ScheduledAiJobForm';

type Props = {
  jobs: ScheduledAiJobView[];
  runs: ScheduledAiJobRunView[];
  options: ScheduledAiJobOptions;
};

export function ScheduledAiJobList({ jobs, runs, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [creating, setCreating] = useState(false);
  const tab = search.get('tab') === 'runs' ? 'runs' : 'jobs';
  const jobFilter = search.get('jobId') ?? '';
  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (value && value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`${pathname}?${params}`);
  };
  const select = (value: 'jobs' | 'runs') => setParam('tab', value);
  const filteredRuns = jobFilter
    ? runs.filter((run) => run.jobId === jobFilter)
    : runs;
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return (
    <>
      <SettingsTabs
        tabs={[
          { id: 'jobs', label: 'Jobs' },
          { id: 'runs', label: 'Runs' },
        ]}
        selected={tab}
        onSelect={select}
      >
        {tab === 'jobs' && (
          <div className="mb-md flex justify-end">
            <Button onClick={() => setCreating(true)}>Create job</Button>
          </div>
        )}
        {tab === 'jobs' ? (
          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableHeader>Name</DataTableHeader>
                <DataTableHeader>Status</DataTableHeader>
                <DataTableHeader>Schedule</DataTableHeader>
                <DataTableHeader>Next run</DataTableHeader>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {jobs.map((job) => (
                <DataTableRow key={job.id}>
                  <DataTableCell>
                    <Link
                      className="text-primary hover:underline"
                      href={`/admin/ai/jobs/${job.id}`}
                    >
                      {job.name}
                    </Link>
                  </DataTableCell>
                  <DataTableCell>{job.status}</DataTableCell>
                  <DataTableCell>
                    {job.scheduleCron} · {job.timeZone}
                  </DataTableCell>
                  <DataTableCell>
                    {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}
                  </DataTableCell>
                </DataTableRow>
              ))}
              {!jobs.length && (
                <DataTableRow>
                  <DataTableCell colSpan={4} className="text-muted">
                    No Jobs yet.
                  </DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
          </DataTable>
        ) : (
          <>
            <div className="mb-md flex items-center gap-sm">
              <label htmlFor="scheduled-ai-runs-job-filter" className="text-xs text-muted">
                Job
              </label>
              <select
                id="scheduled-ai-runs-job-filter"
                value={jobFilter}
                onChange={(e) => setParam('jobId', e.target.value || null)}
                className="rounded-md border border-border bg-background px-sm py-xs text-sm"
              >
                <option value="">All jobs</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableHeader>Run</DataTableHeader>
                  <DataTableHeader>Job</DataTableHeader>
                  <DataTableHeader>Status</DataTableHeader>
                  <DataTableHeader>Trigger</DataTableHeader>
                  <DataTableHeader>Queued</DataTableHeader>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {filteredRuns.map((run) => (
                  <DataTableRow key={run.id}>
                    <DataTableCell>
                      <Link
                        className="text-primary hover:underline"
                        href={`/admin/ai/jobs/${run.jobId}/runs/${run.id}`}
                      >
                        {run.id.slice(0, 8)}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>
                      <Link
                        className="text-primary hover:underline"
                        href={`/admin/ai/jobs/${run.jobId}`}
                      >
                        {jobsById.get(run.jobId)?.name ?? run.definitionSnapshot.name}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>{run.status}</DataTableCell>
                    <DataTableCell>{run.trigger}</DataTableCell>
                    <DataTableCell>
                      {run.scheduledFor || run.startedAt
                        ? new Date(run.scheduledFor ?? run.startedAt!).toLocaleString()
                        : '—'}
                    </DataTableCell>
                  </DataTableRow>
                ))}
                {!filteredRuns.length && (
                  <DataTableRow>
                    <DataTableCell colSpan={5} className="text-muted">
                      {jobFilter ? 'No runs for the selected job.' : 'No scheduled AI runs yet.'}
                    </DataTableCell>
                  </DataTableRow>
                )}
              </DataTableBody>
            </DataTable>
          </>
        )}
      </SettingsTabs>
      {creating && (
        <ModalDialog
          title="Create Job"
          description="AI changes always require review before becoming durable."
          onClose={() => setCreating(false)}
        >
          <ScheduledAiJobForm
            options={options}
            onCancel={() => setCreating(false)}
            onSaved={(job) => {
              setCreating(false);
              router.push(`/admin/ai/jobs/${job.id}`);
              router.refresh();
            }}
          />
        </ModalDialog>
      )}
    </>
  );
}
