import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import { getSwitchState } from '@/server/services/writing-mode';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('admin.writingMode.metadataTitle') };
}

export default async function AdminWritingModePage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || actor.role !== 'admin') notFound();

  const [locale, state] = await Promise.all([getLocale(), getSwitchState()]);
  const t = getDictionary(locale);
  const modeLabel = state.mode === 'copilot'
    ? t('admin.writingMode.modes.copilot')
    : t('admin.writingMode.modes.llmWiki');
  const modeDescription = state.mode === 'copilot'
    ? t('admin.writingMode.modeDescriptions.copilot')
    : t('admin.writingMode.modeDescriptions.llmWiki');

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.writingMode.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.writingMode.description')}</p>
        </div>
        <section className="max-w-3xl border-y border-border py-md" aria-labelledby="writing-mode-current">
          <h2 id="writing-mode-current" className="text-sm font-medium text-muted">
            {t('admin.writingMode.currentLabel')}
          </h2>
          <p className="mt-xs text-base font-medium">{modeLabel}</p>
          <p className="mt-xs text-sm text-muted">{modeDescription}</p>
        </section>
      </div>
    </Layout>
  );
}
