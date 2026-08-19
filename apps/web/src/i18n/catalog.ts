import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
import type { UiLocale } from './config';

export { getMessagePath, flattenMessageKeys, type MessageCatalog } from './message-path';

export const messages = {
  en: enMessages,
  zh: zhMessages,
} as const;

export type AppMessages = typeof enMessages;

export function getMessages(locale: UiLocale): AppMessages {
  return messages[locale] as AppMessages;
}
