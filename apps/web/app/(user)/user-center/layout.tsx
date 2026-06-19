import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
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
    <Layout userCenter>
      <div className="max-w-4xl mx-auto px-lg py-xl">
        <div className="min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
