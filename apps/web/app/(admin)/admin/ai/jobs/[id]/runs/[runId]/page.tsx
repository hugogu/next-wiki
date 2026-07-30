import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getScheduledAiJobRun } from '@/server/services/scheduled-ai-jobs';

export const dynamic = 'force-dynamic';
export default async function ScheduledAiJobRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const actor = await getCurrentActor(); if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();
  const { id, runId } = await params; const run = await getScheduledAiJobRun({ actor }, id, runId);
  return <Layout admin><div className="space-y-md px-lg py-md"><Link className="text-sm text-primary hover:underline" href={`/admin/ai/jobs/${id}`}>← Job details</Link><div><h1 className="font-display text-xl font-semibold">Run {run.id.slice(0, 8)}</h1><p className="mt-xs text-sm text-muted">{run.status} · {run.trigger}</p></div><section className="rounded-lg border border-border p-md"><h2 className="font-semibold">Definition snapshot</h2><p className="mt-sm text-sm">{run.definitionSnapshot.name} · v{run.definitionSnapshot.version}</p></section>{run.errorMessage && <section className="rounded-lg border border-danger/30 p-md text-sm text-danger">{run.errorMessage}</section>}{run.proposalLinks.length > 0 && <section><h2 className="mb-sm font-semibold">Proposals</h2>{run.proposalLinks.map((proposal) => <Link key={proposal.id} className="mr-md text-sm text-primary hover:underline" href={proposal.href}>{proposal.title}</Link>)}</section>}</div></Layout>;
}
