/** Normalize a reader URL without fetching it or forwarding credentials. */
export function readerReferencePath(reference: string, siteUrl: string): string {
  const value = reference.trim();
  if (!value || value.startsWith('//') || value.includes('\\')) {
    throw new Error('Provide a Wiki reader URL or slash-separated reader address.');
  }
  const base = new URL(siteUrl);
  const url = new URL(value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `/${value}`, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) {
    throw new Error('The reader URL must belong to the configured Wiki origin.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname || pathname.includes('//')) throw new Error('Provide a page address, not a space root.');
  for (const segment of pathname.slice(1).split('/')) {
    const decoded = decodeURIComponent(segment);
    if (!decoded || /[/\\\x00-\x1f]/.test(decoded)) throw new Error('Invalid page address segment.');
  }
  return pathname;
}
