import type { ReaderSpace } from './path';

/** Folder URLs use organizational paths; page URLs continue to use slugs. */
export function getDirectoryHref(space: ReaderSpace, path = ''): string {
  return `/pages/browse/${space}${path ? '/' + path.split('/').map(encodeURIComponent).join('/') : ''}`;
}
