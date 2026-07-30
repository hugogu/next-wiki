'use client';

import { useState } from 'react';
import {
  SCHEDULED_AI_JOB_CONTEXT_HELP,
  type ScheduledAiJobView,
  type SkillSummary,
} from '@next-wiki/shared';
import { apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type ScheduledAiJobOptions = {
  spaces: { id: string; name: string; slug: string }[];
  skills: SkillSummary[];
};

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function ScheduledAiJobForm({
  initial,
  options,
  onCancel,
  onSaved,
}: {
  initial?: ScheduledAiJobView;
  options: ScheduledAiJobOptions;
  onCancel: () => void;
  onSaved: (job: ScheduledAiJobView) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [taskDescription, setTaskDescription] = useState(initial?.taskDescription ?? '');
  const [scheduleCron, setScheduleCron] = useState(initial?.scheduleCron ?? '0 3 * * *');
  const [timeZone, setTimeZone] = useState(
    initial?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  );
  const [spaceIds, setSpaceIds] = useState(initial?.targetScope.spaceIds ?? []);
  const [skillNames, setSkillNames] = useState(initial?.targetScope.skillNames ?? []);
  const [enabled, setEnabled] = useState(initial?.status === 'enabled');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectableSkills = options.skills.filter((skill) => skill.enabled);
  return (
    <form
      className="space-y-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        const body = {
          name,
          taskDescription,
          scheduleCron,
          timeZone,
          targetScope: { spaceIds, skillNames },
          status: enabled ? ('enabled' as const) : ('paused' as const),
        };
        try {
          const job = initial
            ? await apiPatch<typeof body, ScheduledAiJobView>(
                `/api/ai/scheduled-jobs/${initial.id}`,
                body,
              )
            : await apiPost<typeof body, ScheduledAiJobView>('/api/ai/scheduled-jobs', body);
          onSaved(job);
        } catch (value) {
          setError((value as ApiError).message ?? 'Unable to save job.');
        } finally {
          setSaving(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <label className="block space-y-xs">
        <span className="text-sm font-medium">Name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} />
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">Task description</span>
        <textarea
          className="min-h-32 w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          required
          maxLength={12000}
          placeholder="Describe the maintenance task and required reviewable outcome."
        />
        <span className="text-xs text-muted">{SCHEDULED_AI_JOB_CONTEXT_HELP}</span>
      </label>
      <div className="grid gap-md sm:grid-cols-2">
        <label className="block space-y-xs">
          <span className="text-sm font-medium">Cron schedule</span>
          <Input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} required />
          <span className="text-xs text-muted">Five fields, e.g. 0 3 * * *</span>
        </label>
        <label className="block space-y-xs">
          <span className="text-sm font-medium">Time zone</span>
          <Input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required />
        </label>
      </div>
      <fieldset className="space-y-sm">
        <legend className="text-sm font-medium">Writable spaces</legend>
        <p className="text-xs text-muted">
          The Job can read every space available to its execution owner. Select only the spaces it
          may create or change pages in; leave this empty for a read-only analysis Job. Select
          Generated when a task turns raw entries into generated Wiki pages.
        </p>
        <div className="max-h-40 space-y-xs overflow-auto rounded-md border border-border p-sm">
          {options.spaces.map((space) => (
            <label key={space.id} className="flex items-center gap-sm text-sm">
              <input
                type="checkbox"
                checked={spaceIds.includes(space.id)}
                onChange={() => setSpaceIds((values) => toggle(values, space.id))}
              />
              <span>{space.name}</span>
              <span className="text-xs text-muted">/{space.slug}</span>
            </label>
          ))}
          {!options.spaces.length && <p className="text-sm text-muted">No spaces are available.</p>}
        </div>
      </fieldset>
      <fieldset className="space-y-sm">
        <legend className="text-sm font-medium">Skills</legend>
        <p className="text-xs text-muted">
          Only selected Skills are listed to this Job and can be loaded at runtime.
        </p>
        <div className="max-h-40 space-y-xs overflow-auto rounded-md border border-border p-sm">
          {selectableSkills.map((skill) => (
            <label key={skill.name} className="flex items-start gap-sm text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={skillNames.includes(skill.name)}
                onChange={() => setSkillNames((values) => toggle(values, skill.name))}
              />
              <span>
                <span className="font-medium">{skill.name}</span>
                <span className="block text-xs text-muted">{skill.description}</span>
              </span>
            </label>
          ))}
          {!selectableSkills.length && (
            <p className="text-sm text-muted">No enabled Skills are available.</p>
          )}
        </div>
      </fieldset>
      <label className="flex items-center gap-sm text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
        Enable after saving
      </label>
      <div className="flex justify-end gap-sm">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create job'}
        </Button>
      </div>
    </form>
  );
}
