import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { getCurrentActor, mustResetPassword } from '@/server/services/auth';

export const metadata: Metadata = {
  title: 'Set new password',
};

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage() {
  const actor = await getCurrentActor();

  // This page is only reachable for signed-in users who need a password reset.
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
        <h1 className="font-display text-2xl font-semibold mb-md">Set a new password</h1>
        <p className="text-muted mb-md text-sm">
          Your password was reset by an administrator. Choose a new password to continue.
        </p>
        <SetPasswordForm />
      </div>
    </Layout>
  );
}
