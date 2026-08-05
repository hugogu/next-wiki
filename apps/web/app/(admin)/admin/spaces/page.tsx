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
      <div className="space-y-md px-lg py-md">
        <div><h1 className="font-display text-xl font-semibold">Space settings</h1><p className="mt-xs text-sm text-muted">Configure the public URL prefix and default visibility for each built-in space.</p></div>
        <SpaceSettingsPanel initialSpaces={spaces.map((space) => ({ ...space, isActive: space.kind === 'wiki' || llmWikiMode }))} />
      </div>
    </Layout>
  );
}
