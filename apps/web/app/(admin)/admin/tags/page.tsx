import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TagManager } from '@/components/admin/tags/TagManager';
import { Layout } from '@/components/ui/Layout';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.tags.metadataTitle') };
}

export default async function AdminTagsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || actor.role !== 'admin') notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.tags.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.tags.description')}</p>
        </div>
        <TagManager />
      </div>
    </Layout>
  );
}
