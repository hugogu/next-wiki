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
  const locale = await getLocale();
  const t = getDictionary(locale);

  const actor = await getCurrentActor();

  const users = await userService.listSafe({ actor });
  if (!users) {
    notFound();
  }

  return (
    <Layout admin>
      <div className="max-w-5xl mx-auto px-lg py-xl">
        <div className="mb-lg">
          <h1 className="font-display text-3xl font-semibold">{t('admin.users.metadataTitle')}</h1>
          <p className="text-muted">{t('admin.users.description')}</p>
        </div>
        <UserManagementTable users={users} />
      </div>
    </Layout>
  );
}
