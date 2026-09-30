import { readerReferencePath, type PublicPageInclude } from '@next-wiki/shared';
import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { resolveReaderPage } from './reader-routing';
import { getPageById } from './public-content';

/** Use the same slug, space-prefix, locale, and alias rules as the reader. */
export async function getPageByReference(
  ctx: PermCtx,
  reference: string,
  siteUrl: string,
  include: readonly PublicPageInclude[] = [],
) {
  let pathname: string;
  try {
    pathname = readerReferencePath(reference, siteUrl);
  } catch (error) {
    throw new DomainError('BAD_REQUEST', error instanceof Error ? error.message : 'Invalid reader URL');
  }
  const resolved = await resolveReaderPage(ctx, pathname.slice(1).split('/'));
  if (resolved.kind !== 'original' && resolved.kind !== 'translation') return null;
  // Repeat the API visibility and API-key space-scope checks on the final target.
  return getPageById(ctx, resolved.page.pageId, include);
}
