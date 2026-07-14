import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FeishuBindingPanel } from '@/components/user-center/FeishuBindingPanel';
import { getLocale, getDictionary } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import { getOwnActiveBinding } from '@/server/services/feishu-bindings';
import { isFeishuConfigured } from '@/server/services/feishu-config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('userCenter.feishu.settingsMetadataTitle') };
}

export default async function UserFeishuPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') redirect('/auth/login');

  const [configured, binding] = await Promise.all([
    isFeishuConfigured(),
    getOwnActiveBinding(actor.userId),
  ]);
  return (
    <FeishuBindingPanel
      configured={configured}
      initialBinding={
        binding
          ? {
              displayName: binding.displayName,
              boundAt: binding.boundAt.toISOString(),
              lastSeenAt: binding.lastSeenAt?.toISOString() ?? null,
            }
          : null
      }
    />
  );
}
