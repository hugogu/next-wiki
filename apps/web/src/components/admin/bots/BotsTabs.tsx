'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AiRuntimeSettingsView, ContentDataSourceItem, FeishuConfigView } from '@next-wiki/shared';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { FeishuIntegrationPanel } from '@/components/admin/feishu/FeishuIntegrationPanel';
import { ContentDataSourcesPanel } from '@/components/admin/ContentDataSourcesPanel';
import { AiRuntimeParamsPanel } from '@/components/admin/ai/AiRuntimeParamsPanel';
import { useTranslation } from '@/i18n/client';

type BotsTab = 'general' | 'feishu';
const TABS: BotsTab[] = ['general', 'feishu'];

function parseTab(value: string | null): BotsTab {
  return TABS.includes(value as BotsTab) ? (value as BotsTab) : 'general';
}

/**
 * Second-level tabs inside the Bots admin page. `general` (025) holds the
 * shared, channel-agnostic AI Conversations Data Source — the single
 * writable location for that toggle (see ContentDataSourcesPanel). Feishu is
 * the first provider tab; future providers (Slack, Telegram, …) register here
 * as additional tabs. The selected tab is restorable from the URL
 * (`?tab=general` / `?tab=feishu`) like the AI admin tabs.
 */
export function BotsTabs({
  feishuConfig,
  dataSources,
  runtimeSettings,
}: {
  feishuConfig: FeishuConfigView;
  dataSources: ContentDataSourceItem[];
  runtimeSettings: AiRuntimeSettingsView;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseTab(searchParams.get('tab'));
  const selectTab = (tab: BotsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <SettingsTabs<BotsTab>
      tabs={[
        { id: 'general', label: t('admin.bots.tabs.general') },
        { id: 'feishu', label: t('admin.nav.feishu') },
      ]}
      selected={selected}
      onSelect={selectTab}
    >
      {selected === 'general' && (
        <div className="space-y-lg">
          <ContentDataSourcesPanel initial={dataSources} />
          <AiRuntimeParamsPanel initial={runtimeSettings} />
        </div>
      )}
      {selected === 'feishu' && <FeishuIntegrationPanel initial={feishuConfig} />}
    </SettingsTabs>
  );
}

export type { BotsTab };
