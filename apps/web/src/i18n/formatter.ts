import { createFormatter } from 'next-intl';
import type { UiLocale } from './config';
import { formats } from './formats';

export function createAppFormatter(locale: UiLocale) {
  return createFormatter({ locale, formats, timeZone: 'UTC', now: new Date() });
}
