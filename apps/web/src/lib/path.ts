export function getPagePathFromParams(params: { path: string[] }): string {
  return params.path.map((segment) => decodeURIComponent(segment)).join('/');
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

/** Public reader URL when the server has resolved the space configuration. */
export function getConfiguredSpaceHref(prefix: string, path?: string, locale?: string | null): string {
  const segments = [encodeURIComponent(prefix)];
  if (locale && locale !== 'en') segments.push(encodeURIComponent(locale));
  if (path) segments.push(encodePath(path));
  return `/${segments.join('/')}`;
}

export type ReaderSpace = 'wiki' | 'raw' | 'generated';

/** Maps a space's slug (e.g. from a search result) to the reader-space
 * vocabulary used by getSpaceHref/getSpaceEditHref/etc. Every space besides
 * the two special ones is a 'wiki' space (there is only one today, slug
 * 'default', but any other wiki-kind slug should still resolve here). */
export function readerSpaceFromSlug(slug: string): ReaderSpace {
  return slug === 'generated' ? 'generated' : slug === 'raw' ? 'raw' : 'wiki';
}

export function getPageHref(path: string): string {
  return `/${encodePath(path)}`;
}

/** Canonical reader URL for a page in the selected content space.
 *
 * For raw/generated spaces, a concrete page path is routed at the canonical
 * public prefix (`/raw/{path}` or `/generated/{path}`). The bare space root
 * (`/raw`, `/generated`) has no public reader landing page, so the space
 * switcher and other root links continue to use the admin-only `/spaces/{space}`
 * route that renders the space index.
 */
export function getSpaceHref(space: ReaderSpace, path?: string): string {
  if (space === 'wiki') return path ? getPageHref(path) : '/';
  if (path) return `/${space}/${encodePath(path)}`;
  return `/spaces/${space}`;
}

/**
 * Canonical reader URL for an AI citation, which may point at a wiki,
 * generated, or raw page (e.g. a captured Conversation page). Citations
 * persisted before `spaceSlug` existed omit it — absence is treated as the
 * wiki space, matching every citation's implicit space before that field was
 * added.
 */
export function getCitationHref(citation: { path: string; slug?: string; spaceSlug?: string }): string {
  const space = citation.spaceSlug ? readerSpaceFromSlug(citation.spaceSlug) : 'wiki';
  // A translation row owns no independent slug (always ''), so an empty
  // string — not just a missing field — must also fall back to `path`.
  return getSpaceHref(space, citation.slug || citation.path);
}

export function getSpaceNewHref(space: ReaderSpace): string {
  return space === 'wiki' ? '/new' : `/new?space=${space}`;
}

export function getSpaceEditHref(space: ReaderSpace, path: string): string {
  return space === 'wiki' ? getEditHref(path) : `/edit/${encodePath(path)}?space=${space}`;
}

/**
 * Language-prefixed reader URL for a translated page (015). The unprefixed
 * `getPageHref` remains the canonical source/original address; a translation is
 * served at `/{language}/{path}` where `language` is a lowercase ISO 639-1 code.
 */
export function getTranslatedPageHref(locale: string, path: string): string {
  return `/${encodeURIComponent(locale)}/${encodePath(path)}`;
}

export function getPagesHref(): string {
  return '/pages';
}

export function getEditHref(path: string): string {
  return `/edit/${encodePath(path)}`;
}

export function getHistoryHref(path: string): string {
  return `/h/${encodePath(path)}`;
}

export function getSpaceHistoryHref(space: ReaderSpace, path: string, compare?: string): string {
  const query = new URLSearchParams();
  if (space !== 'wiki') query.set('space', space);
  if (compare) query.set('compare', compare);
  const qs = query.toString();
  return `/h/${encodePath(path)}${qs ? `?${qs}` : ''}`;
}

/** Opens the latest draft in its review context: compare it with the previous
 * revision when one exists, otherwise preview the first draft in full. */
export function getSpaceDraftReviewHref(space: ReaderSpace, path: string, latestVersion: number): string {
  const query = new URLSearchParams();
  if (space !== 'wiki') query.set('space', space);
  if (latestVersion > 1) {
    query.set('compare', `${latestVersion - 1}..${latestVersion}`);
  } else {
    query.set('selected', String(Math.max(1, latestVersion)));
  }
  return `/h/${encodePath(path)}?${query}`;
}

export function getRevisionHref(path: string, version: number): string {
  return `/revisions/${version}/${encodePath(path)}`;
}

export type RevisionDiffOptions = {
  view: 'source' | 'preview';
  context: number | 'full';
  ignoreWhitespace: boolean;
  sync: boolean;
};

export const defaultRevisionDiffOptions: RevisionDiffOptions = {
  view: 'source', context: 3, ignoreWhitespace: false, sync: true,
};

export function parseRevisionPair(value: string): { earlier: number; later: number; reversed: boolean } | null {
  const match = /^(\d+)\.\.(\d+)$/.exec(value);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 1 || second < 1 || first === second) return null;
  return { earlier: Math.min(first, second), later: Math.max(first, second), reversed: first > second };
}

/**
 * The comparison to show when History is opened without one in the URL.
 *
 * Opening History almost always means "what changed most recently", so landing
 * on an empty "select two revisions" pane made every visitor do the same two
 * clicks. Derived from the *visible* revisions rather than `latest - 1`, so a
 * reader who cannot see drafts still gets the two newest revisions they are
 * allowed to compare rather than a pair with a hole in it.
 *
 * Null when there is only one revision — there is nothing to compare.
 */
export function defaultComparePair(
  revisions: { version: number }[],
): { earlier: number; later: number } | null {
  if (revisions.length < 2) return null;
  const [latest, previous] = revisions;
  return { earlier: previous!.version, later: latest!.version };
}

export function parseRevisionDiffOptions(params: URLSearchParams): RevisionDiffOptions {
  const context = params.get('context');
  const numericContext = context !== null && /^\d+$/.test(context) ? Number(context) : null;
  return {
    view: params.get('view') === 'preview' ? 'preview' : 'source',
    context: context === 'full' ? 'full' : (numericContext !== null && Number.isSafeInteger(numericContext) ? numericContext : 3),
    ignoreWhitespace: params.get('ignoreWhitespace') === '1',
    sync: params.get('sync') !== '0',
  };
}

export function getRevisionDiffHref(path: string, first: number, second: number, options: Partial<RevisionDiffOptions> = {}): string {
  const earlier = Math.min(first, second);
  const later = Math.max(first, second);
  const value = { ...defaultRevisionDiffOptions, ...options };
  const params = new URLSearchParams();
  if (value.view !== 'source') params.set('view', value.view);
  if (value.context !== 3) params.set('context', String(value.context));
  if (value.ignoreWhitespace) params.set('ignoreWhitespace', '1');
  if (!value.sync) params.set('sync', '0');
  const query = params.toString();
  return `/revisions/${earlier}..${later}/${encodePath(path)}${query ? `?${query}` : ''}`;
}

export function getPublicApiPageUrl(id: string): string {
  return `/api/v1/pages/${encodeURIComponent(id)}`;
}

export function getPublicApiPageMetadataUrl(id: string): string {
  return `/api/v1/pages/${encodeURIComponent(id)}/metadata`;
}

export function getPublicApiPagesUrl(): string {
  return '/api/v1/pages';
}

export function getPublicApiPageByPathUrl(path: string): string {
  return `/api/v1/pages?path=${encodePath(path)}`;
}

export function getPublicApiPageDraftsUrl(pageId: string): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/drafts`;
}

export function getPublicApiPageAddressesUrl(pageId: string): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/addresses`;
}

export function getPublicApiPageAddressUrl(pageId: string, addressId: string): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/addresses/${encodeURIComponent(addressId)}`;
}

export function getPublicApiPageRevisionsUrl(pageId: string): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/revisions`;
}

export function getPublicApiPageRevisionUrl(pageId: string, version: number): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/revisions/${version}`;
}

export function getPublicApiPagePublicationUrl(pageId: string, version: number): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/revisions/${version}/publication`;
}

export function leafTitleFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}
