import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { UserManagementTable } from '@/components/admin/UserManagementTable';
import { getCurrentActor } from '@/server/services/auth';
import * as userService from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'User management',
};

export default async function AdminUsersPage() {
  const actor = await getCurrentActor();

  // Service-level permission check: returns null for non-admins (no leak).
  const users = await userService.listSafe({ actor });
  if (!users) {
    notFound();
  }

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Admin' },
          { label: 'Users' },
        ]}
      />
      <div className="mb-md">
        <h1 className="text-2xl font-semibold">User management</h1>
        <p className="text-muted">Manage roles, status, and passwords.</p>
      </div>
      <UserManagementTable users={users} />
    </Layout>
  );
}
