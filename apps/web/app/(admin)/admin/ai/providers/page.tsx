import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AiProvidersPage() {
  redirect('/admin/ai?tab=providers');
}
