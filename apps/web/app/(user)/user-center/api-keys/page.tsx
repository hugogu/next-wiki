import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ApiKeyList } from '@/components/user-center/ApiKeyList';
import { AgentMemoryConnections } from '@/components/user-center/AgentMemoryConnections';
import { getCurrentActor } from '@/server/services/auth';
import * as apiKeyService from '@/server/services/api-keys';
import * as agentMemoryConnectionService from '@/server/services/agent-memory-connections';
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
  const currentUserIsAdmin = actor.kind === 'user' && actor.role === 'admin';
  const connections = currentUserIsAdmin
    ? await agentMemoryConnectionService.listConnections({ actor })
    : [];
  return (
    <div className="w-full min-w-0">
      {currentUserIsAdmin && <AgentMemoryConnections initialConnections={connections} />}
      <ApiKeyList initialKeys={keys} currentUserIsAdmin={currentUserIsAdmin} />
    </div>
  );
}
