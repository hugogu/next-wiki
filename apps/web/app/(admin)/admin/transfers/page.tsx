import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import {
  ArchiveImportPanel,
  ExportPanel,
  TransferAdminTabs,
  TransferRunList,
  WikiJsSourcePanel,
  type TransferTab,
} from '@/components/admin/transfers';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import * as transfers from '@/server/services/transfers';
import * as transferSources from '@/server/services/transfer-sources';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return { title: t('admin.transfers.metadataTitle') };
}

function tab(value?: string): TransferTab {
  return ['exports', 'archives', 'wikijs', 'history'].includes(value ?? '')
    ? (value as TransferTab)
    : 'exports';
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getCurrentActor();
  const ctx = { actor };
  if (!can(ctx, 'manage_transfers', { kind: 'transfers' })) notFound();
  const selected = tab((await searchParams).tab);
  const runs = (await transfers.list(ctx, { limit: 20, offset: 0 })).items;
  const sources = await transferSources.list(ctx);
  const t = getDictionary(await getLocale());
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.transfers.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.transfers.description')}</p>
        </div>
        <TransferAdminTabs selected={selected}>
          {selected === 'exports' && <ExportPanel runs={runs.filter((run) => run.kind === 'site_export')} />}
          {selected === 'archives' && <ArchiveImportPanel runs={runs.filter((run) => run.kind.startsWith('archive_'))} />}
          {selected === 'wikijs' && <WikiJsSourcePanel sources={sources} runs={runs.filter((run) => run.kind.startsWith('wikijs_'))} />}
          {selected === 'history' && <TransferRunList runs={runs} />}
        </TransferAdminTabs>
      </div>
    </Layout>
  );
}
