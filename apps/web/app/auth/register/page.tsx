import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { RegisterForm } from '@/components/auth/RegisterForm';
import * as setupService from '@/server/services/setup';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('auth.register.metadataTitle') };
}

export default async function RegisterPage() {
  // First-run onboarding: registration is the normal-user path. The initial
  // admin must be created through the guided `/setup` route instead.
  if (await setupService.isSetupNeeded()) {
    redirect('/setup');
  }

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">{t('auth.register.heading')}</h1>
        <RegisterForm />
        <p className="mt-md text-sm text-muted">
          {t('auth.register.hasAccount')}{' '}
          <Link href="/auth/login" className="text-primary hover:underline">{t('auth.register.signInLink')}</Link>
        </p>
      </div>
    </Layout>
  );
}
