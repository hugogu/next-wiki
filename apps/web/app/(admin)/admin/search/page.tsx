import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SearchSettingsPanel } from '@/components/admin/search/SearchSettingsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { readSearchSettings } from '@/server/services/search-settings';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminSearchSettingsPage() {
  const actor = await getCurrentActor();
  let settings;
  try {
    settings = await readSearchSettings({ actor });
  } catch {
    notFound();
  }
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.searchSettings.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.searchSettings.description')}</p>
        </div>
        <SearchSettingsPanel initial={settings} />
      </div>
    </Layout>
  );
}
