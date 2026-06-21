import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Provider details are now edited from a modal on the capability list, so this
// legacy deep link just returns to the AI admin console.
export default async function AiProviderPage() {
  redirect('/admin/ai?tab=chat');
}
