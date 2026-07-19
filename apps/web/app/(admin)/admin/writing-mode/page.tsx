import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import { getSwitchState } from '@/server/services/writing-mode';
import { WritingModeControls } from '@/components/admin/writing-mode/WritingModeControls';

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

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.writingMode.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.writingMode.description')}</p>
        </div>
        <WritingModeControls initial={state} />
      </div>
    </Layout>
  );
}
