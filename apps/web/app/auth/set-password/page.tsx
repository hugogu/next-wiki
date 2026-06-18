import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { getCurrentActor, mustResetPassword } from '@/server/services/auth';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('auth.setPassword.metadataTitle') };
}

export default async function SetPasswordPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const actor = await getCurrentActor();

  if (actor.kind !== 'user') {
    redirect('/auth/login');
  }

  const needsReset = await mustResetPassword({ actor });
  if (!needsReset) {
    redirect('/');
  }

  return (
    <Layout skipPasswordGate>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">{t('auth.setPassword.heading')}</h1>
        <p className="text-muted mb-md text-sm">
          {t('auth.setPassword.description')}
        </p>
        <SetPasswordForm />
      </div>
    </Layout>
  );
}
