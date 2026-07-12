import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { TranslationRunDetail } from '@/components/admin/translations';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import * as translations from '@/server/services/translations';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return { title: t('translation.admin.runs') };
}

export default async function TranslationRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getCurrentActor();
  const ctx = { actor };
  if (!can(ctx, 'manage_translations', { kind: 'translations' })) notFound();

  const { id } = await params;
  const [run, items] = await Promise.all([
    translations.getRun(ctx, id),
    translations.listItems(ctx, id, { limit: 500, offset: 0 }),
  ]).catch((error) => {
    if (error instanceof DomainError) notFound();
    throw error;
  });

  return (
    <Layout admin>
      <TranslationRunDetail run={run} items={items.items} />
    </Layout>
  );
}
