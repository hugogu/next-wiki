import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { UserCenterNav } from '@/components/user-center/UserCenterNav';
import { getCurrentActor } from '@/server/services/auth';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.metadataTitle') };
}

export default async function UserCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    redirect('/auth/login');
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-lg py-xl">
        <div className="mb-lg">
          <h1 className="font-display text-3xl font-semibold">User Center</h1>
        </div>
        <div className="flex flex-col md:flex-row gap-lg">
          <UserCenterNav />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </Layout>
  );
}
