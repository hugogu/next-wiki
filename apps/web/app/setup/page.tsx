import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SetupForm } from '@/components/auth/SetupForm';
import * as setupService from '@/server/services/setup';

export const metadata: Metadata = {
  title: 'First-run setup',
};

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  // Self-disabling: once any admin exists, the setup route refuses.
  const needed = await setupService.isSetupNeeded();
  if (!needed) {
    redirect('/');
  }

  return (
    <Layout skipPasswordGate>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">Welcome to next-wiki</h1>
        <p className="text-muted mb-md text-sm">
          Create the initial admin account to get started. This screen is only
          available while no admins exist.
        </p>
        <SetupForm />
      </div>
    </Layout>
  );
}
