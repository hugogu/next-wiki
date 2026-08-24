import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AdminPagesPanel } from '@/components/admin/pages/AdminPagesPanel';
import { getCurrentActor } from '@/server/services/auth';
import * as pageService from '@/server/services/pages';
import { isLlmWikiMode } from '@/server/services/writing-mode';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type AdminPagesSearchParams = Promise<{
  page?: string;
  sort?: string;
  direction?: string;
  keyword?: string;
  title?: string;
  author?: string;
  path?: string;
  dateFrom?: string;
  dateTo?: string;
  space?: string;
}>;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.pages.metadataTitle') };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPagesPage({ searchParams }: { searchParams: AdminPagesSearchParams }) {
  const params = await searchParams;
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') redirect('/auth/login');
  const canManage = actor.role === 'admin';

  const query = {
    page: first(params.page),
    sort: first(params.sort),
    direction: first(params.direction),
    keyword: first(params.keyword),
    title: first(params.title),
    author: first(params.author),
    path: first(params.path),
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    space: first(params.space),
  };

  const spaceFilterEnabled = await isLlmWikiMode();
  const list = await pageService.listAdminPages(
    { actor },
    {
      page: query.page ? Number(query.page) : undefined,
      sort: query.sort,
      direction: query.direction,
      filters: {
        keyword: query.keyword,
        title: query.title,
        author: query.author,
        path: query.path,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        // Raw/generated spaces exist only in LLM Wiki mode. The filter itself
        // is read-only, so signed-in viewers may use it as well.
        space: spaceFilterEnabled ? query.space : undefined,
      },
    },
  );
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="px-lg py-md">
        <AdminPagesPanel
          t={t}
          list={list}
          query={query}
          canManage={canManage}
          spaceFilterEnabled={spaceFilterEnabled}
        />
      </div>
    </Layout>
  );
}
