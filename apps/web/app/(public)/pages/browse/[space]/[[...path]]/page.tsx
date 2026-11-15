import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { DirectoryItems } from '@/components/layout/DirectoryItems';
import { PageBreadcrumbs } from '@/components/pages/PageBreadcrumbs';
import { getCurrentActor } from '@/server/services/auth';
import { getCachedPageBreadcrumbs, getCachedPageNavigation, getPageBreadcrumbs, getPageNavigation } from '@/server/services/page-navigation';
import { resolveSpace } from '@/server/services/spaces';
import { effectiveRoutePrefix } from '@/server/services/space-routes';
import { getDictionary, getLocale } from '@/i18n/server';
import { decodePathSegment } from '@/lib/path';
import { publicPageNavigationQuerySchema } from '@next-wiki/shared';

export const dynamic = 'force-dynamic';

export default async function BrowseDirectory({ params }: {
  params: Promise<{ space: string; path?: string[] }>;
}) {
  const [route, actor, locale] = await Promise.all([params, getCurrentActor(), getLocale()]);
  const query = publicPageNavigationQuerySchema.safeParse({
    space: route.space,
    path: route.path?.map(decodePathSegment).join('/') ?? '',
    status: actor.kind === 'anonymous' ? 'published' : 'all',
    mode: 'current',
  });
  if (!query.success) notFound();
  const space = await resolveSpace(query.data.space);
  if (!space) notFound();
  const [navigation, ancestors] = await Promise.all([
    actor.kind === 'anonymous' ? getCachedPageNavigation(query.data) : getPageNavigation({ actor }, query.data),
    actor.kind === 'anonymous' ? getCachedPageBreadcrumbs(query.data.path, space.slug) : getPageBreadcrumbs({ actor }, query.data.path, space.slug),
  ]);
  const t = getDictionary(locale);
  const prefix = effectiveRoutePrefix(space);
  const title = query.data.path.split('/').at(-1) || (space.kind === 'wiki' ? t('navigation.wiki') : space.name);

  return (
    <Layout space={space.kind} routePrefix={prefix} navigationPath={query.data.path}>
      <article className="mx-auto w-full max-w-5xl px-lg py-md">
        <PageBreadcrumbs ancestors={ancestors} space={space.kind} routePrefix={prefix}
          rootLabel={space.kind === 'wiki' ? t('navigation.wiki') : space.name}
          label={t('space.reader.breadcrumbs')} title={query.data.path ? title : undefined} />
        <h1 className="mb-md font-display text-2xl font-semibold">{title}</h1>
        {navigation.root.children.length
          ? <DirectoryItems nodes={navigation.root.children} space={space.kind} routePrefix={prefix} childrenLabel={t('navigation.children')} />
          : <p className="text-muted">{t('navigation.empty')}</p>}
      </article>
    </Layout>
  );
}
