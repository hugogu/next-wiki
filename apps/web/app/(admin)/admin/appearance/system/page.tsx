import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SystemThemeManager } from '@/components/admin/appearance/SystemThemeManager';
import { AppearanceNav } from '@/components/admin/appearance/AppearanceNav';
import { PREVIEW_SAMPLE_MARKDOWN } from '@/components/admin/appearance/preview-sample';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { listSystemThemes } from '@/server/services/system-theme';
import { renderMarkdown } from '@/server/pipeline';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminSystemThemePage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const initial = await listSystemThemes({ actor });
  const { html: sampleHtml } = renderMarkdown(PREVIEW_SAMPLE_MARKDOWN);
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.appearance.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.appearance.description')}</p>
        </div>
        <AppearanceNav />
        <SystemThemeManager initial={initial} sampleHtml={sampleHtml} />
      </div>
    </Layout>
  );
}
