import { enqueue, QUEUES } from '@/server/jobs/runtime';

/** Queue ISR priming after a committed public-content mutation. */
export async function enqueuePublicPageWarmup(href: string): Promise<void> {
  if (!href.startsWith('/') || href.startsWith('//')) {
    throw new Error('Public page warmup requires an absolute-path URL');
  }
  await enqueue(QUEUES.publicPageWarmup, { href });
}
