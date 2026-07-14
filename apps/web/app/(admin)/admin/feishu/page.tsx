import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { FeishuIntegrationPanel } from '@/components/admin/feishu/FeishuIntegrationPanel';
import { env } from '@/server/config';
import { can } from '@/server/permissions';
import { getCurrentActor } from '@/server/services/auth';
import { getConfigView } from '@/server/services/feishu-config';

export const dynamic = 'force-dynamic';

export default async function AdminFeishuPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();

  const config = await getConfigView({ actor });
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">飞书机器人</h1>
          <p className="mt-xs text-sm text-muted">
            配置现有飞书企业自建应用，并把机器人接入当前 Wiki。
          </p>
        </div>
        <FeishuIntegrationPanel
          initial={config}
          callbackUrl={`${env.APP_URL.replace(/\/$/, '')}/webhooks/feishu/events`}
        />
      </div>
    </Layout>
  );
}
