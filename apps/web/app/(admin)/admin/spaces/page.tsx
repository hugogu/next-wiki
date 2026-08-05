import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SpaceSettingsPanel } from '@/components/admin/spaces/SpaceSettingsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { listSpaceConfigurations } from '@/server/services/spaces';
import { isLlmWikiMode } from '@/server/services/writing-mode';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Space settings' };

export default async function AdminSpacesPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || actor.role !== 'admin') notFound();
  const [spaces, llmWikiMode] = await Promise.all([listSpaceConfigurations(), isLlmWikiMode()]);
  return (
    <Layout admin>
      <div className="px-lg py-md">
        <SpaceSettingsPanel initialSpaces={spaces.map((space) => ({ ...space, isActive: space.kind === 'wiki' || llmWikiMode }))} />
      </div>
    </Layout>
  );
}
