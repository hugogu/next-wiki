import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import { isLlmWikiMode } from '@/server/services/writing-mode';
import { listCategories } from '@/server/services/raw-categories';
import { RawCategoriesManager } from '@/components/admin/RawCategoriesManager';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('admin.rawCategories.metadataTitle') };
}

export default async function AdminRawCategoriesPage() {
  const actor = await getCurrentActor();
  // Raw categories only exist in LLM Wiki mode; Copilot deployments have no raw space.
  if (actor.kind !== 'user' || actor.role !== 'admin' || !(await isLlmWikiMode())) notFound();

  const [locale, categories] = await Promise.all([getLocale(), listCategories({ actor })]);
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.rawCategories.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.rawCategories.description')}</p>
        </div>
        <RawCategoriesManager initial={categories} />
      </div>
    </Layout>
  );
}
