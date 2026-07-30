import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ScheduledAiJobList } from '@/components/admin/ai/ScheduledAiJobList';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { listAllScheduledAiJobRuns, listScheduledAiJobs } from '@/server/services/scheduled-ai-jobs';
import { listSpaces } from '@/server/services/spaces';
import { listSkillsForAdmin } from '@/server/services/skills/admin';

export const dynamic = 'force-dynamic';
export default async function ScheduledAiJobsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();
  const [jobs, runs, spaces, catalogue] = await Promise.all([listScheduledAiJobs({ actor }), listAllScheduledAiJobRuns({ actor }), listSpaces(), listSkillsForAdmin({ actor })]);
  const options = { spaces: spaces.map((space) => ({ id: space.id, name: space.name, slug: space.slug })), skills: catalogue.skills };
  return <Layout admin><div className="space-y-md px-lg py-md"><div><h1 className="font-display text-xl font-semibold">Jobs</h1><p className="mt-xs text-sm text-muted">Recurring, reviewable Wiki AI maintenance tasks.</p></div><ScheduledAiJobList jobs={jobs} runs={runs} options={options} /></div></Layout>;
}
