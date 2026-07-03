import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { LoginForm } from '@/components/auth/LoginForm';
import * as setupService from '@/server/services/setup';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('auth.login.metadataTitle') };
}

export default async function LoginPage() {
  // First-run onboarding: there is nothing to sign in to yet.
  if (await setupService.isSetupNeeded()) {
    redirect('/setup');
  }

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">{t('auth.login.heading')}</h1>
        <LoginForm />
        <p className="mt-md text-sm text-muted">
          {t('auth.login.noAccount')}{' '}
          <Link href="/auth/register" className="text-primary hover:underline">{t('auth.login.createAccountLink')}</Link>
        </p>
      </div>
    </Layout>
  );
}
