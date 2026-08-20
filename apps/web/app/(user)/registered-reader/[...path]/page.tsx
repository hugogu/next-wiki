import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ReaderPageView } from '@/components/pages/ReaderPageView';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams } from '@/lib/path';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { buildReaderMetadata, resolveReaderPage } from '@/server/services/reader-routing';
import { getDictionary, getLocale } from '@/i18n/server';
import { env } from '@/server/config';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const [raw, actor, locale] = await Promise.all([params, getCurrentActor(), getLocale()]);
  const t = getDictionary(locale);
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const resolved = await resolveReaderPage({ actor }, raw.path);
  // Never indexable: this is an internal rewrite target behind the same
  // external URL the public route already serves to crawlers.
  return buildReaderMetadata(resolved, {
    siteUrl,
    locale,
    t,
    fallbackTitle: getPagePathFromParams(raw),
    indexable: false,
  });
}

/**
 * Internal dynamic reader target. The proxy preserves the external canonical
 * URL while sending authenticated requests here, so registered pages never
 * enter the anonymous ISR document cache.
 */
export default async function RegisteredReaderPage({ params }: { params: PageParams }) {
  const [raw, actor, locale] = await Promise.all([params, getCurrentActor(), getLocale()]);
  const resolved = await resolveReaderPage({ actor }, raw.path);

  if (resolved.kind === 'not_found') notFound();
  if (resolved.kind === 'forbidden') {
    return <ReaderPageView actor={actor} locale={locale} resolved={resolved} staticPublic={false} />;
  }
  if (resolved.legacy) {
    permanentRedirect(canonicalSpacePath(
      resolved.space,
      resolved.sourcePath,
      resolved.kind === 'translation' || resolved.kind === 'unavailable' ? resolved.locale : null,
    ));
  }

  return <ReaderPageView actor={actor} locale={locale} resolved={resolved} staticPublic={false} />;
}
