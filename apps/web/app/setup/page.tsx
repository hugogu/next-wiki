import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SetupForm } from '@/components/auth/SetupForm';
import * as setupService from '@/server/services/setup';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('setup.metadataTitle') };
}

export default async function SetupPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const needed = await setupService.isSetupNeeded();
  if (!needed) {
    redirect('/');
  }

  return (
    <Layout skipPasswordGate>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">{t('setup.heading')}</h1>
        <p className="text-muted mb-md text-sm">
          {t('setup.description')}
        </p>
        <SetupForm />
      </div>
    </Layout>
  );
}
