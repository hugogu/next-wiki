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

  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.users.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.users.description')}</p>
        </div>
        <UserManagementTable users={users} />
      </div>
    </Layout>
  );
}
