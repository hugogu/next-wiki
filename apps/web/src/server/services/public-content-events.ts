import { enqueueGitExport } from './git-export';
import { markStaleAndMaybePublish } from './static-site';

/**
 * One notification point for "publicly visible content changed".
 *
 * Two independent features react to this: Git export mirrors the raw Markdown,
 * and static site publishing regenerates the reader-facing site. They stay
 * independent — separate targets, triggers, state, and artifacts — but the
 * *event* is one event, and the call sites should not have to know how many
 * listeners exist. Before this, every mutation path called Git export directly;
 * adding a second listener at eight call sites is exactly how one gets missed.
 *
 * `reason` distinguishes an ordinary publish, which each feature may choose to
 * ignore based on its own settings, from a bulk change that should always sync,
 * and from `rendering` — the rendered output of unchanged source (a manual
 * re-render). A listener that mirrors source, rather than rendered output, has
 * nothing to do for that last one. Call sites still describe what happened and
 * leave that judgement to each listener.
 */
export async function notifyPublicContentChanged(
  reason: 'publish' | 'manual' | 'rendering' = 'publish',
): Promise<void> {
  // Each listener decides for itself whether this event warrants work, and a
  // failure in one must not stop the other from hearing about the change.
  const results = await Promise.allSettled([
    enqueueGitExport(reason),
    markStaleAndMaybePublish(),
  ]);

  const failure = results.find((result) => result.status === 'rejected');
  if (failure && failure.status === 'rejected') throw failure.reason;
}
