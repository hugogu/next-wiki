import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminAiActionsPage() {
  redirect('/admin/ai?tab=actions');
}
