import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getScheduledAiJob, listScheduledAiJobRuns } from '@/server/services/scheduled-ai-jobs';
import { ScheduledAiJobDetail } from '@/components/admin/ai/ScheduledAiJobDetail';
import { listSpaces } from '@/server/services/spaces';
import { listSkillsForAdmin } from '@/server/services/skills/admin';

export const dynamic = 'force-dynamic';
export default async function ScheduledAiJobPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();
  const { id } = await params;
  const [job, runs, spaces, catalogue] = await Promise.all([
    getScheduledAiJob({ actor }, id),
    listScheduledAiJobRuns({ actor }, id),
    listSpaces(),
    listSkillsForAdmin({ actor }),
  ]);
  const options = {
    spaces: spaces.map((space) => ({ id: space.id, name: space.name, slug: space.slug })),
    skills: catalogue.skills,
  };
  const allowedSpaces = options.spaces.filter((space) =>
    job.targetScope.spaceIds.includes(space.id),
  );
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <Link className="text-sm text-primary hover:underline" href="/admin/ai/jobs">
          ← Jobs
        </Link>
        <div>
          <h1 className="font-display text-xl font-semibold">{job.name}</h1>
          <p className="mt-xs text-sm text-muted">
            {job.scheduleCron} · {job.timeZone} · {job.status}
          </p>
        </div>
        <ScheduledAiJobDetail job={job} runs={runs} options={options} />
        <section className="rounded-lg border border-border p-md">
          <h2 className="font-semibold">Task description</h2>
          <p className="mt-sm whitespace-pre-wrap text-sm">{job.taskDescription}</p>
          <p className="mt-sm text-sm text-muted">
            Allowed spaces:{' '}
            {allowedSpaces
              .map((space) => `${space.name} (${space.slug === 'default' ? 'wiki' : space.slug})`)
              .join(', ') || 'none'}{' '}
            · {job.targetScope.skillNames.length} selected skill(s)
          </p>
        </section>
        <section>
          <h2 className="mb-sm font-semibold">Recent runs</h2>
          <ul className="space-y-xs">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  className="text-sm text-primary hover:underline"
                  href={`/admin/ai/jobs/${id}/runs/${run.id}`}
                >
                  {run.status} · {run.trigger} · {run.id.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Layout>
  );
}
