import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { CreatePageForm } from '@/components/pages/CreatePageForm';
import { getCurrentActor } from '@/server/services/auth';
import * as pageService from '@/server/services/pages';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('page.create.metadataTitle') };
}

export default async function NewPage({ searchParams }: { searchParams: Promise<{ prefix?: string }> }) {
  const actor = await getCurrentActor();

  const allowed = await pageService.canCreate({ actor });
  if (!allowed) {
    notFound();
  }

  // Strip surrounding slashes so a node path like "ai/apps" becomes the
  // prefix the dialog pre-fills as "ai/apps/". The path field still validates
  // the final value on submit, so a malformed prefix simply fails there.
  const rawPrefix = (await searchParams).prefix ?? '';
  const initialPathPrefix = rawPrefix.replace(/^\/+|\/+$/g, '');

  return (
    <Layout fitViewport>
      <div className="h-full flex flex-col">
        <CreatePageForm initialPathPrefix={initialPathPrefix} />
      </div>
    </Layout>
  );
}
