import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function AiIndexesPage() {
  redirect('/admin/ai?tab=indexes');
}
