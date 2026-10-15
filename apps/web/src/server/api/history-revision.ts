import type { RevisionView } from '@next-wiki/shared';
import type { HistoryRevision } from '@/lib/history-revision';
import { markdownBodyLineOffset } from '@/server/metadata/frontmatter';

/**
 * The slice of a revision the History view renders. The page's first paint and
 * the on-demand revision endpoint both build it here, so a revision looks the
 * same whichever way it arrives.
 */
export function toHistoryRevision(
  revision: Pick<RevisionView, 'version' | 'contentSource' | 'contentHtml'>,
): HistoryRevision {
  return {
    version: revision.version,
    contentSource: revision.contentSource,
    contentHtml: revision.contentHtml,
    previewLineOffset: markdownBodyLineOffset(revision.contentSource),
  };
}
