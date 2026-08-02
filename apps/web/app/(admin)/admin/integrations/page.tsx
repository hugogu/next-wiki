import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { IntegrationsPanel } from '@/components/admin/integrations/IntegrationsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { getIntegration } from '@/server/services/integrations';
import { DomainError } from '@/server/errors';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.integrations.metadataTitle') };
}

export default async function AdminIntegrationsPage() {
  const actor = await getCurrentActor();

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  let github;
  try {
    github = await getIntegration({ actor }, 'github');
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.integrations.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.integrations.description')}</p>
        </div>
        <IntegrationsPanel initial={github} />
      </div>
    </Layout>
  );
}
