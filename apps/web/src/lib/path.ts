export function getPagePathFromParams(params: { path: string[] }): string {
  return params.path.map((segment) => decodeURIComponent(segment)).join('/');
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export type ReaderSpace = 'wiki' | 'raw' | 'generated';

export function getPageHref(path: string): string {
  return `/${encodePath(path)}`;
}

/** Canonical reader URL for a page in the selected content space. */
export function getSpaceHref(space: ReaderSpace, path?: string): string {
  if (space === 'wiki') return path ? getPageHref(path) : '/';
  const root = `/spaces/${space}`;
  return path ? `${root}/${encodePath(path)}` : root;
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
  return `/history/${encodePath(path)}`;
}

export function getSpaceHistoryHref(space: ReaderSpace, path: string, compare?: string): string {
  const query = new URLSearchParams();
  if (space !== 'wiki') query.set('space', space);
  if (compare) query.set('compare', compare);
  const qs = query.toString();
  return `/history/${encodePath(path)}${qs ? `?${qs}` : ''}`;
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

export function getPublicApiPagesUrl(): string {
  return '/api/v1/pages';
}

export function getPublicApiPageByPathUrl(path: string): string {
  return `/api/v1/pages?path=${encodePath(path)}`;
}

export function getPublicApiPageDraftsUrl(pageId: string): string {
  return `/api/v1/pages/${encodeURIComponent(pageId)}/drafts`;
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
