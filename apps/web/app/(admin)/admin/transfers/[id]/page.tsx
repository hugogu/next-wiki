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
  let items: Awaited<ReturnType<typeof transfers.listItems>>['items'];
  try {
    const { id } = await params;
    const [run, itemList] = await Promise.all([
      transfers.get(ctx, id),
      transfers.listItems(ctx, id, { limit: 100, offset: 0 }),
    ]);
    result = run;
    items = itemList.items;
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  return <Layout admin><div className="px-lg py-md"><TransferRunDetail run={result} items={items} /></div></Layout>;
}
