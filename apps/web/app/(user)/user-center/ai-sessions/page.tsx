import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AiSessionsPanel } from '@/components/user-center/AiSessionsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { listUserConversations } from '@/server/services/ai-actions';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.aiSessions.metadataTitle') };
}

export default async function AiSessionsPage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    redirect('/auth/login');
  }

  const initial = await listUserConversations({ actor });
  return (
    <div className="w-full min-w-0">
      <AiSessionsPanel initial={initial} />
    </div>
  );
}
