import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { integrationKindSchema } from '@next-wiki/shared';
import { Layout } from '@/components/ui/Layout';
import { BackLink } from '@/components/ui/BackLink';
import { IntegrationConfigPanel } from '@/components/admin/integrations/IntegrationConfigPanel';
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

export default async function AdminIntegrationDetailPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const parsed = integrationKindSchema.safeParse((await params).kind);
  if (!parsed.success) notFound();
  const kind = parsed.data;

  const actor = await getCurrentActor();

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  let integration;
  try {
    integration = await getIntegration({ actor }, kind);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div className="space-y-xs">
          <BackLink fallbackHref="/admin/integrations">{t('common.actions.back')}</BackLink>
          <h1 className="font-display text-xl font-semibold">
            {t(`admin.integrations.${kind}.name` as 'admin.integrations.github.name')}
          </h1>
          <p className="text-sm text-muted">
            {t(`admin.integrations.${kind}.description` as 'admin.integrations.github.description')}
          </p>
        </div>
        <IntegrationConfigPanel kind={kind} initial={integration} />
      </div>
    </Layout>
  );
}
