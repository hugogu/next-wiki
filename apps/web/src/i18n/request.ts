import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getMessages } from './catalog';
import { formats } from './formats';
import { localeCookieName, isLocale } from './config';
import { resolveUiLocale } from './resolve';

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  let locale = explicitLocale;
  if (!isLocale(locale)) {
    const cookieStore = await cookies();
    const headersList = await headers();
    locale = resolveUiLocale({
      cookieValue: cookieStore.get(localeCookieName)?.value,
      acceptLanguage: headersList.get('accept-language'),
    });
  }

  return {
    locale,
    messages: getMessages(locale),
    formats,
    timeZone: 'UTC',
  };
});
