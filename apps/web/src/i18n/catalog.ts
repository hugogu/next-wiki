import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import type { UiLocale } from './config';

export const messages = {
  en: enMessages,
  zh: zhMessages,
} as const;

export type AppMessages = typeof enMessages;
export type MessageCatalog = Record<string, unknown>;

export function getMessages(locale: UiLocale): AppMessages {
  return messages[locale] as AppMessages;
}

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
