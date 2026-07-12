export function getPagePathFromParams(params: { path: string[] }): string {
  return params.path.map((segment) => decodeURIComponent(segment)).join('/');
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function getPageHref(path: string): string {
  return `/${encodePath(path)}`;
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

export function getRevisionHref(path: string, version: number): string {
  return `/revisions/${version}/${encodePath(path)}`;
}

export function getPropertiesHref(path: string): string {
  return `/properties/${encodePath(path)}`;
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
