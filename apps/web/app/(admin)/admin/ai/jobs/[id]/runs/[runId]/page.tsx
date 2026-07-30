import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getScheduledAiJobRun } from '@/server/services/scheduled-ai-jobs';
import { getAllActionEvents } from '@/server/services/ai-actions';
import { ScheduledAiJobRunExecution } from '@/components/admin/ai/ScheduledAiJobRunExecution';
import { listSpaces } from '@/server/services/spaces';

export const dynamic = 'force-dynamic';
export default async function ScheduledAiJobRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const actor = await getCurrentActor(); if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();
  const { id, runId } = await params; const run = await getScheduledAiJobRun({ actor }, id, runId);
  const [events, spaces] = await Promise.all([
    run.actionId ? getAllActionEvents({ actor }, run.actionId) : [],
    listSpaces(),
  ]);
  const snapshot = run.definitionSnapshot;
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const scopedSpaceNames = snapshot.targetScope.spaceIds.map((spaceId) => {
    const space = spaceById.get(spaceId);
    return space ? `${space.name} (${space.slug === 'default' ? 'wiki' : space.slug})` : 'Unavailable space';
  });
  return <Layout admin><div className="space-y-md px-lg py-md"><Link className="text-sm text-primary hover:underline" href={`/admin/ai/jobs/${id}`}>← Job details</Link><div><h1 className="font-display text-xl font-semibold">Run {run.id.slice(0, 8)}</h1><p className="mt-xs text-sm text-muted">{run.status} · {run.trigger}</p></div><ScheduledAiJobRunExecution jobId={id} initialRun={run} initialEvents={events} /><section className="rounded-lg border border-border p-md"><h2 className="font-semibold">Definition snapshot</h2><dl className="mt-sm grid gap-md text-sm sm:grid-cols-2"><div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Job</dt><dd className="mt-xs">{snapshot.name} · v{snapshot.version}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Schedule</dt><dd className="mt-xs">{snapshot.scheduleCron} · {snapshot.timeZone}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-muted">Task description</dt><dd className="mt-xs whitespace-pre-wrap">{snapshot.taskDescription}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Allowed spaces</dt><dd className="mt-xs">{scopedSpaceNames.join(', ')}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted">Selected skills</dt><dd className="mt-xs">{snapshot.targetScope.skillNames.join(', ') || 'None'}</dd></div></dl></section>{run.errorMessage && <section className="rounded-lg border border-danger/30 p-md text-sm text-danger">{run.errorMessage}</section>}{run.proposalLinks.length > 0 && <section><h2 className="mb-sm font-semibold">Proposals</h2>{run.proposalLinks.map((proposal) => <Link key={proposal.id} className="mr-md text-sm text-primary hover:underline" href={proposal.href}>{proposal.title}</Link>)}</section>}</div></Layout>;
}
