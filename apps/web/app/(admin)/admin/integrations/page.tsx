import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { IntegrationKind, IntegrationView } from '@next-wiki/shared';
import { Layout } from '@/components/ui/Layout';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getCurrentActor } from '@/server/services/auth';
import { listIntegrations } from '@/server/services/integrations';
import { DomainError } from '@/server/errors';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** One card per supported service. New providers (GitLab, …) join this list. */
const PROVIDERS: IntegrationKind[] = ['github'];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.integrations.metadataTitle') };
}

function authSummary(
  integration: IntegrationView,
  t: ReturnType<typeof getDictionary>,
): string {
  const parts: string[] = [
    integration.authMode === 'ssh'
      ? t('admin.integrations.authSsh')
      : t('admin.integrations.authHttps'),
  ];
  if (integration.authMode === 'ssh' && integration.fingerprint) {
    parts.push(integration.fingerprint);
  }
  if (integration.authMode === 'https_token' && integration.username) {
    parts.push(integration.username);
  }
  return parts.join(' · ');
}

export default async function AdminIntegrationsPage() {
  const actor = await getCurrentActor();

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  let integrations: IntegrationView[];
  try {
    integrations = await listIntegrations({ actor });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  const byKind = new Map(integrations.map((item) => [item.kind, item]));

  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.integrations.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.integrations.description')}</p>
        </div>

        <ul className="space-y-sm">
          {PROVIDERS.map((kind) => {
            const integration = byKind.get(kind);
            return (
              <li key={kind} className="rounded-md border border-border p-md">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="space-y-xs">
                    <div className="flex items-center gap-sm">
                      <h2 className="text-sm font-medium">
                        {t(`admin.integrations.${kind}.name` as 'admin.integrations.github.name')}
                      </h2>
                      <StatusBadge tone={integration ? 'success' : 'neutral'}>
                        {integration
                          ? t('admin.integrations.statusConfigured')
                          : t('admin.integrations.statusNotConfigured')}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-muted">
                      {t(
                        `admin.integrations.${kind}.description` as 'admin.integrations.github.description',
                      )}
                    </p>
                    {integration ? (
                      <p className="text-xs text-muted">
                        {authSummary(integration, t)}
                        {' · '}
                        {t('admin.integrations.updated', {
                          date: new Date(integration.updatedAt).toLocaleString(),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/admin/integrations/${kind}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {t('admin.integrations.configure')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Layout>
  );
}
