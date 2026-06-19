import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { UserManagementTable } from '@/components/admin/UserManagementTable';
import { getCurrentActor } from '@/server/services/auth';
import * as userService from '@/server/services/users';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.users.metadataTitle') };
}

export default async function AdminUsersPage() {
  const actor = await getCurrentActor();

  const users = await userService.listSafe({ actor });
  if (!users) {
    notFound();
  }

  return (
    <Layout admin>
      <div className="px-lg py-md">
        <UserManagementTable users={users} />
      </div>
    </Layout>
  );
}
