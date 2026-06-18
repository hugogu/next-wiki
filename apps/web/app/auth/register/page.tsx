import Link from 'next/link';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getLocale, getDictionary } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('auth.register.metadataTitle') };
}

export default async function RegisterPage() {
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
