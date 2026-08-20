import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ReaderPageView } from '@/components/pages/ReaderPageView';
import { buildAnonymousCtx } from '@/server/permissions';
import { getPagePathFromParams } from '@/lib/path';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { buildReaderMetadata, resolveReaderPage } from '@/server/services/reader-routing';
import { getDictionary, getStaticLocale } from '@/i18n/server';
import { env } from '@/server/config';

// Published reader pages are generated on their first visit and then served as
// ISR. Session-specific controls hydrate in the shell after the document is
// delivered, so cookies and headers must not make the document body dynamic.
export const dynamic = 'force-static';
export const revalidate = 300;
export const dynamicParams = true;

/**
 * Do not enumerate the database at build time: self-hosted image builds do not
 * have a database connection. `dynamicParams` keeps every published path
 * eligible for on-demand ISR generation after deployment.
 */
export async function generateStaticParams(): Promise<{ path: string[] }[]> {
  return [];
}

type PageParams = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const [raw, locale] = await Promise.all([params, getStaticLocale()]);
  const t = getDictionary(locale);
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  // Anonymous context so crawlers see the same metadata logged-out visitors do.
  const resolved = await resolveReaderPage(buildAnonymousCtx(), raw.path);
  return buildReaderMetadata(resolved, {
    siteUrl,
    locale,
    t,
    fallbackTitle: getPagePathFromParams(raw),
    indexable: true,
  });
}

export default async function PageRead({ params }: { params: PageParams }) {
  const locale = await getStaticLocale();
  const raw = await params;
  // This route has a single anonymous published representation. Authenticated
  // actions are fetched by AppShell after hydration and remain protected by
  // their server endpoints.
  const actor = buildAnonymousCtx().actor;
  const resolved = await resolveReaderPage({ actor }, raw.path);

  if (resolved.kind === 'not_found') notFound();

  if (resolved.kind === 'forbidden') {
    return <ReaderPageView actor={actor} locale={locale} resolved={resolved} staticPublic />;
  }

  if (resolved.legacy) {
    permanentRedirect(canonicalSpacePath(
      resolved.space,
      resolved.sourcePath,
      resolved.kind === 'translation' || resolved.kind === 'unavailable' ? resolved.locale : null,
    ));
  }

  return <ReaderPageView actor={actor} locale={locale} resolved={resolved} staticPublic />;
}
