import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SetupForm } from '@/components/auth/SetupForm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export const metadata: Metadata = {
  title: 'First-run setup',
};

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const adminExists = await db.query.users.findFirst({
    where: eq(schema.users.role, 'admin'),
  });

  // Self-disabling: once any admin exists, the setup route refuses.
  if (adminExists) {
    redirect('/');
  }

  return (
    <Layout skipPasswordGate>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-md">Welcome to next-wiki</h1>
        <p className="text-muted mb-md text-sm">
          Create the initial admin account to get started. This screen is only
          available while no admins exist.
        </p>
        <SetupForm />
      </div>
    </Layout>
  );
}
