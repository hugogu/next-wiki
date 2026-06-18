import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ApiKeyList } from '@/components/user-center/ApiKeyList';
import { getCurrentActor } from '@/server/services/auth';
import * as apiKeyService from '@/server/services/api-keys';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.apiKeys.metadataTitle') };
}

export default async function ApiKeysPage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    redirect('/auth/login');
  }

  const keys = await apiKeyService.list({ actor });
  return (
    <div className="max-w-3xl">
      <ApiKeyList initialKeys={keys} />
    </div>
  );
}
