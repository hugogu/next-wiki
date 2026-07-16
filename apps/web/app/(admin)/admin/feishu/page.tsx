import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { FeishuIntegrationPanel } from '@/components/admin/feishu/FeishuIntegrationPanel';
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
            关联飞书后，团队成员可以在飞书里直接向本 Wiki 提问、搜索页面并接收更新通知，无需离开聊天窗口。
          </p>
        </div>
        <FeishuIntegrationPanel initial={config} />
      </div>
    </Layout>
  );
}
