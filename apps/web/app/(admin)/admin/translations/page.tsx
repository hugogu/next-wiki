import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import {
  TranslationSettingsPanel,
  type TranslationTab,
} from '@/components/admin/translations';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import * as translations from '@/server/services/translations';
import * as config from '@/server/services/translation-config';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return { title: t('translation.admin.title') };
}

function tab(value?: string): TranslationTab {
  return ['overview', 'languages', 'styles', 'runs', 'documents', 'usage'].includes(value ?? '')
    ? (value as TranslationTab)
    : 'overview';
}

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getCurrentActor();
  const ctx = { actor };
  if (!can(ctx, 'manage_translations', { kind: 'translations' })) notFound();

  const selected = tab((await searchParams).tab);
  const [languages, styles, models, runs, documents, usage, stats] = await Promise.all([
    config.listLanguages(ctx),
    config.listPrompts(ctx),
    config.listTextModels(ctx),
    translations.listRuns(ctx, { limit: 20, offset: 0 }),
    translations.listDocuments(ctx, { limit: 50, offset: 0 }),
    translations.getUsage(ctx, { groupBy: 'language' }),
    translations.getStats(ctx),
  ]);
  const t = getDictionary(await getLocale());

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('translation.admin.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('translation.admin.subtitle')}</p>
        </div>
        <TranslationSettingsPanel
          selected={selected}
          languages={languages}
          styles={styles}
          models={models}
          runs={runs.items}
          documents={documents.items}
          usage={usage.rows}
          stats={stats}
        />
      </div>
    </Layout>
  );
}
