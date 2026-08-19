/**
 * Dotted-key path helpers for the legacy `t('a.b.c')` translation call sites.
 * Deliberately free of any dependency on the message JSON catalogs: client
 * components that only need path resolution (not the catalog data itself)
 * import from here instead of `./catalog`, so bundlers never pull the ~200 KB
 * bilingual dictionary into a chunk that only wanted this logic.
 */

export type MessageCatalog = Record<string, unknown>;

/**
 * The source dictionaries historically used dotted keys. Five keys also have
 * children with the same prefix, so the JSON catalog stores those leaf values
 * under `__value`. This helper keeps old call sites source-compatible while
 * they move to next-intl's nested message paths.
 */
export function getMessagePath(key: string, catalog: MessageCatalog): string {
  const parts = key.split('.');
  let node: unknown = catalog;

  for (const [index, part] of parts.entries()) {
    if (!node || typeof node !== 'object' || !(part in node)) return key;
    node = (node as Record<string, unknown>)[part];
    if (index === parts.length - 1 && node && typeof node === 'object' && '__value' in node) {
      return `${key}.__value`;
    }
  }

  return key;
}

export function flattenMessageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (key === '__value') return prefix ? [prefix] : [];
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenMessageKeys(child, next);
  });
}
