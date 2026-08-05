import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ReaderPageView } from '@/components/pages/ReaderPageView';
import { getCurrentActor } from '@/server/services/auth';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { resolveReaderPage } from '@/server/services/reader-routing';
import { getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ path: string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
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
  if (resolved.legacy) {
    permanentRedirect(canonicalSpacePath(
      resolved.space,
      resolved.sourcePath,
      resolved.kind === 'translation' || resolved.kind === 'unavailable' ? resolved.locale : null,
    ));
  }

  return <ReaderPageView actor={actor} locale={locale} resolved={resolved} staticPublic={false} />;
}
