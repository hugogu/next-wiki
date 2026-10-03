import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, type Actor } from '@/server/permissions';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import { resolveReaderPage } from '@/server/services/reader-routing';
import { isLlmWikiMode } from '@/server/services/writing-mode';

import { getReservedLocalePrefixes, isReservedLocalePrefix } from '@/server/services/translation-locales';

const MARKDOWN_CONTENT_TYPE = 'text/markdown';

export type RawMarkdownResult =
  | { kind: 'ok'; content: string; title: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported'; contentType: string }
  | { kind: 'forbidden' };

/**
 * Resolve a public reader URL path (space prefix, optional locale, then the
 * page's slug or a retained alias) and return the current revision's raw
 * Markdown source. Resolution is delegated to the HTML reader's own resolver so
 * a page's `.md` address is always its reader address plus `.md`.
 *
 * `segments` are the path segments as the route received them: Next has already
 * percent-decoded them, while the resolver decodes its input again. They are
 * re-encoded for it, because decoding a literal `%` that survived the first
 * decode (`/x%25y.md`) throws a URIError and would answer 500 instead of 404.
 */
export async function getWikiRawMarkdown(segments: string[]): Promise<RawMarkdownResult> {
  const resolved = await resolveReaderPage(
    buildAnonymousCtx(),
    segments.map((segment) => encodeURIComponent(segment)),
  );
  switch (resolved.kind) {
    case 'original':
    case 'translation':
      return readRevisionMarkdown(resolved.page.revisionId, resolved.page.title);
    case 'unavailable':
      return { kind: 'unavailable' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'not_found':
      return getWikiRawMarkdownByTreePath(segments);
  }
}

/**
 * `.md` links created before slug routing (035) named a page by its tree path
 * (`/<tree path>.md`), which is no longer a public address. Keep them resolving
 * so existing links and scripts do not break.
 */
async function getWikiRawMarkdownByTreePath(segments: string[]): Promise<RawMarkdownResult> {
  const fullPath = segments.join('/');

  if (segments.length >= 2 && isReservedLocalePrefix(await getReservedLocalePrefixes(), segments[0]!)) {
    const locale = segments[0]!;
    const sourcePath = segments.slice(1).join('/');
    const translation = await pageService.getCachedPublicLiveTranslation(locale, sourcePath);
    if (translation.kind === 'page') {
      return readRevisionMarkdown(translation.page.revisionId, translation.page.title);
    }
    if (translation.kind === 'unavailable') {
      return { kind: 'unavailable' };
    }
    if (translation.kind === 'forbidden') {
      return { kind: 'forbidden' };
    }
    // not_found → fall through to original resolution of the full path.
  }

  const original = await pageService.getCachedPublicLivePage(fullPath);
  if (!original) {
    return (await pageService.getReaderAccessStatus(buildAnonymousCtx(), fullPath))?.kind === 'forbidden'
      ? { kind: 'forbidden' }
      : { kind: 'not_found' };
  }
  return readRevisionMarkdown(original.revisionId, original.title);
}

async function readRevisionMarkdown(revisionId: string, title: string): Promise<RawMarkdownResult> {
  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, revisionId),
  });
  if (!revision) return { kind: 'not_found' };
  if (revision.contentType !== MARKDOWN_CONTENT_TYPE) {
    return { kind: 'unsupported', contentType: revision.contentType };
  }
  const content = await readMarkdownFromDatabase(revision);
  return { kind: 'ok', content, title };
}

/**
 * Resolve a private content-space (generated or raw) reader path and return the
 * latest revision's raw source. Reuses the same visibility rules as the space
 * reader page: admin-only in LLM Wiki mode, raw non-markdown returns 415.
 */
export async function getSpaceRawMarkdown(
  space: string,
  path: string,
  actor: Actor,
): Promise<RawMarkdownResult> {
  if (space !== 'generated' && space !== 'raw') return { kind: 'not_found' };
  if (actor.kind !== 'user' || actor.role !== 'admin' || !(await isLlmWikiMode())) {
    return { kind: 'forbidden' };
  }
  if (!path) return { kind: 'not_found' };

  const page = await publicContent.getPageByPath({ actor }, path, ['latestRevision'], space);
  if (!page || page.status === 'deleted') return { kind: 'not_found' };

  const contentType = page.latestRevision?.contentType ?? MARKDOWN_CONTENT_TYPE;
  if (contentType !== MARKDOWN_CONTENT_TYPE) {
    return { kind: 'unsupported', contentType };
  }
  return { kind: 'ok', content: page.contentSource ?? '', title: page.title };
}

export const UNSUPPORTED_STATUS_CODE = 415;
export const MARKDOWN_CONTENT_TYPE_HEADER = 'text/markdown; charset=utf-8';
