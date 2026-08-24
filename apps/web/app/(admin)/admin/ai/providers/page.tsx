import { notFound, redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ProviderList } from '@/components/admin/ai/ProviderList';
import { getCurrentActor } from '@/server/services/auth';
import { listModels, listProviders } from '@/server/services/ai-admin';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AiProvidersPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') notFound();
  if (actor.role === 'admin') redirect('/admin/ai?tab=chat');

  const [providers, models, locale] = await Promise.all([
    listProviders({ actor }),
    listModels({ actor }),
    getLocale(),
  ]);
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.nav.providers')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.ai.description')}</p>
        </div>
        {(['chat', 'embedding', 'image'] as const).map((type) => (
          <section key={type} className="space-y-sm">
            <h2 className="font-display text-lg font-semibold">{t(`admin.ai.providerType.${type}`)}</h2>
            <ProviderList type={type} providers={providers} models={models} canManage={false} />
          </section>
        ))}
      </div>
    </Layout>
  );
}
