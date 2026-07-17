'use client';

import type { FeishuConfigView } from '@next-wiki/shared';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { FeishuIntegrationPanel } from '@/components/admin/feishu/FeishuIntegrationPanel';
import { useTranslation } from '@/i18n/client';

type BotProviderTab = 'feishu';

/**
 * Second-level bot provider tabs inside the Bots admin page. Feishu is the
 * first provider; future providers (Slack, Telegram, …) register here as
 * additional tabs.
 */
export function BotsTabs({ feishuConfig }: { feishuConfig: FeishuConfigView }) {
  const { t } = useTranslation();
  return (
    <SettingsTabs<'feishu'>
      tabs={[{ id: 'feishu', label: t('admin.nav.feishu') }]}
      selected="feishu"
      onSelect={() => undefined}
    >
      <FeishuIntegrationPanel initial={feishuConfig} />
    </SettingsTabs>
  );
}

export type { BotProviderTab };
