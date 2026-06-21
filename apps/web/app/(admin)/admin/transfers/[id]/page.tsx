import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { TransferRunDetail } from '@/components/admin/transfers';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import * as transfers from '@/server/services/transfers';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getCurrentActor();
  const ctx = { actor };
  if (!can(ctx, 'manage_transfers', { kind: 'transfers' })) notFound();
  let result: Awaited<ReturnType<typeof transfers.get>>;
  let itemList: Awaited<ReturnType<typeof transfers.listItems>>;
  try {
    const { id } = await params;
    const [run, list] = await Promise.all([
      transfers.get(ctx, id),
      transfers.listItems(ctx, id, { limit: 20, offset: 0 }),
    ]);
    result = run;
    itemList = list;
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  return <Layout admin><div className="px-lg py-md"><TransferRunDetail run={result} items={itemList.items} total={itemList.total} /></div></Layout>;
}
