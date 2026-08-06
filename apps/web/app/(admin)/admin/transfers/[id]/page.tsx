import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { TransferRunDetail } from '@/components/admin/transfers';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import * as transfers from '@/server/services/transfers';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const ITEM_STATUSES = ['warning', 'failed'] as const;
type ItemStatusFilter = (typeof ITEM_STATUSES)[number];

function parseStatusFilter(value: string | undefined): ItemStatusFilter | undefined {
  return ITEM_STATUSES.find((status) => status === value);
}

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const actor = await getCurrentActor();
  const ctx = { actor };
  if (!can(ctx, 'manage_transfers', { kind: 'transfers' })) notFound();
  let result: Awaited<ReturnType<typeof transfers.get>>;
  let itemList: Awaited<ReturnType<typeof transfers.listItems>>;
  let page: number;
  let status: ItemStatusFilter | undefined;
  try {
    const { id } = await params;
    const sp = await searchParams;
    page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
    status = parseStatusFilter(sp.status);
    const [run, list] = await Promise.all([
      transfers.get(ctx, id),
      transfers.listItems(ctx, id, { limit: 20, offset: (page - 1) * 20, ...(status ? { status } : {}) }),
    ]);
    result = run;
    itemList = list;
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  return (
    <Layout admin>
      <div className="px-lg py-md">
        <TransferRunDetail
          run={result}
          items={itemList.items}
          total={itemList.total}
          initialPage={page - 1}
          initialFilter={status ?? 'all'}
        />
      </div>
    </Layout>
  );
}
