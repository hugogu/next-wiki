import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The Feishu admin surface moved under Bots as a provider tab. */
export default function AdminFeishuPage() {
  redirect('/admin/bots');
}
