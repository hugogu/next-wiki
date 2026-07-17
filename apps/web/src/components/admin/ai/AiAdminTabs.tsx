'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AiActionView,
  AiIndexView,
  AiModelView,
  AiProviderView,
  AiProviderType,
  AiPurpose,
} from '@next-wiki/shared';
import { PlusIcon, CheckIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslation } from '@/i18n/client';
import { ProviderForm } from './ProviderForm';
import { ProviderList } from './ProviderList';
import { ModelCatalog } from './ModelCatalog';
import { IndexList } from './IndexList';
import { AiActionAuditTable } from './AiActionAuditTable';
import { ModelDetectorPanel } from './ModelDetectorPanel';
import { UsagePanel } from './UsagePanel';

type AiAdminTab = 'detector' | 'chat' | 'embedding' | 'image' | 'indexes' | 'actions' | 'usage';
const TABS: AiAdminTab[] = ['detector', 'chat', 'embedding', 'image', 'indexes', 'actions', 'usage'];

const purposeByCapability = {
  chat: 'wiki_text',
  embedding: 'wiki_embedding',
  image: 'wiki_image',
} as const satisfies Record<AiProviderType, AiPurpose>;

function parseTab(value: string | null): AiAdminTab {
  return TABS.includes(value as AiAdminTab) ? (value as AiAdminTab) : 'detector';
}

export function AiAdminTabs({
  providers,
  models,
  assignments,
  indexes,
  actions,
  actionsTotal,
  hasModelDetectorApiKey,
  detector,
}: {
  providers: AiProviderView[];
  models: AiModelView[];
  assignments: Array<{ purpose: AiPurpose; modelId: string }>;
  indexes: AiIndexView[];
  actions: AiActionView[];
  actionsTotal: number;
  hasModelDetectorApiKey: boolean;
  detector: {
    hasOpenRouterKey: boolean;
    cloudflareEnabled: boolean;
    cloudflareAccountId: string | null;
    hasCloudflareToken: boolean;
  };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseTab(searchParams.get('tab'));
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [providerType, setProviderType] = useState<AiProviderType>('chat');
  const selectedCapability: AiProviderType | null =
    selected === 'chat' || selected === 'embedding' || selected === 'image' ? selected : null;
  const selectTab = (tab: AiAdminTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };
  // Any configured detector marks the tab as set up.
  const detectorConfigured =
    detector.hasOpenRouterKey || (Boolean(detector.cloudflareAccountId) && detector.hasCloudflareToken);

  const tabs = [
    {
      id: 'detector' as const,
      label: t('admin.ai.tabs.detector'),
      status: detectorConfigured ? (
        <Tooltip label={t('admin.ai.modelDetector.configuredShort')}>
          <CheckIcon className="h-4 w-4 text-success" />
        </Tooltip>
      ) : undefined,
    },
    {
      id: 'chat' as const,
      label: t('admin.ai.tabs.chat'),
      status: String(providers.filter((provider) => provider.type === 'chat').length),
    },
    {
      id: 'embedding' as const,
      label: t('admin.ai.tabs.embedding'),
      status: String(providers.filter((provider) => provider.type === 'embedding').length),
    },
    {
      id: 'image' as const,
      label: t('admin.ai.tabs.image'),
      status: String(providers.filter((provider) => provider.type === 'image').length),
    },
    {
      id: 'indexes' as const,
      label: t('admin.ai.tabs.indexes'),
      status: indexes.some((index) => index.isActive) ? (
        <Tooltip label={t('admin.ai.index.active')}>
          <CheckIcon className="h-4 w-4 text-success" />
        </Tooltip>
      ) : undefined,
    },
    { id: 'actions' as const, label: t('admin.ai.tabs.actions') },
    { id: 'usage' as const, label: t('admin.ai.tabs.usage') },
  ];

  return (
    <>
      <SettingsTabs tabs={tabs} selected={selected} onSelect={selectTab}>
        {selectedCapability && (
          <section className="space-y-md">
            <div className="flex items-start justify-between gap-md">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {t(`admin.ai.providerType.${selectedCapability}`)}
                </h2>
                <p className="mt-xs text-sm text-muted">
                  {t(`admin.ai.providerType.${selectedCapability}Description`)}
                </p>
              </div>
              <Button
                onClick={() => {
                  setProviderType(selectedCapability);
                  setAddProviderOpen(true);
                }}
              >
                <PlusIcon className="mr-xs h-4 w-4" />
                {t('admin.ai.providers.addCapability')}
              </Button>
            </div>
            <ProviderList
              type={selectedCapability}
              providers={providers}
              models={models}
            />
            <ModelCatalog
              models={models.filter((model) => model.providerType === selectedCapability)}
              providers={providers.filter((provider) => provider.type === selectedCapability)}
              purpose={purposeByCapability[selectedCapability]}
              activeModelId={
                assignments.find((item) => item.purpose === purposeByCapability[selectedCapability])?.modelId ?? null
              }
            />
          </section>
        )}
        {selected === 'detector' && (
          <ModelDetectorPanel
            hasModelDetectorApiKey={hasModelDetectorApiKey}
            cloudflareDetectorEnabled={detector.cloudflareEnabled}
            cloudflareAccountId={detector.cloudflareAccountId}
            hasCloudflareToken={detector.hasCloudflareToken}
          />
        )}
        {selected === 'indexes' && <IndexList indexes={indexes} />}
        {selected === 'actions' && (
          <AiActionAuditTable actions={actions} total={actionsTotal} providers={providers} models={models} />
        )}
        {selected === 'usage' && <UsagePanel />}
      </SettingsTabs>

      {addProviderOpen && (
        <ModalDialog
          title={t('admin.ai.providers.addTyped', {
            type: t(`admin.ai.providerType.${providerType}`),
          })}
          description={t('admin.ai.providers.addDescription')}
          onClose={() => setAddProviderOpen(false)}
        >
          <ProviderForm
            type={providerType}
            onCancel={() => setAddProviderOpen(false)}
            onCreated={() => {
              setAddProviderOpen(false);
              router.refresh();
            }}
          />
        </ModalDialog>
      )}
    </>
  );
}
