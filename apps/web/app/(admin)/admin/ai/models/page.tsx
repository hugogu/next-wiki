import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AiModelsPage() {
  redirect('/admin/ai?tab=models');
}
