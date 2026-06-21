'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AiActionView,
  AiIndexView,
  AiModelView,
  AiProviderView,
  AiProviderType,
  AiPurpose,
} from '@next-wiki/shared';
import { PlusIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { useTranslation } from '@/i18n/client';
import { ProviderForm } from './ProviderForm';
import { ProviderList } from './ProviderList';
import { PurposeAssignments } from './PurposeAssignments';
import { ModelCatalog } from './ModelCatalog';
import { IndexList } from './IndexList';
import { AiActionAuditTable } from './AiActionAuditTable';

type AiAdminTab = 'chat' | 'embedding' | 'image' | 'models' | 'indexes' | 'actions';
const TABS: AiAdminTab[] = ['chat', 'embedding', 'image', 'models', 'indexes', 'actions'];

const purposeByCapability = {
  chat: 'wiki_text',
  embedding: 'wiki_embedding',
  image: 'wiki_image',
} as const satisfies Record<AiProviderType, AiPurpose>;

function parseTab(value: string | null): AiAdminTab {
  return TABS.includes(value as AiAdminTab) ? (value as AiAdminTab) : 'chat';
}

export function AiAdminTabs({
  providers,
  models,
  assignments,
  indexes,
  actions,
  actionsTotal,
}: {
  providers: AiProviderView[];
  models: AiModelView[];
  assignments: Array<{ purpose: AiPurpose; modelId: string }>;
  indexes: AiIndexView[];
  actions: AiActionView[];
  actionsTotal: number;
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

  useEffect(() => {
    if (searchParams.get('tab')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'chat');
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const tabs = [
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
    { id: 'models' as const, label: t('admin.ai.tabs.models') },
    {
      id: 'indexes' as const,
      label: t('admin.ai.tabs.indexes'),
      status: indexes.some((index) => index.isActive) ? t('admin.ai.index.active') : undefined,
    },
    { id: 'actions' as const, label: t('admin.ai.tabs.actions') },
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
              activeModelId={
                assignments.find((item) => item.purpose === purposeByCapability[selectedCapability])?.modelId ?? null
              }
            />
          </section>
        )}
        {selected === 'models' && <PurposeAssignments models={models} assignments={assignments} />}
        {selected === 'indexes' && <IndexList indexes={indexes} />}
        {selected === 'actions' && (
          <AiActionAuditTable actions={actions} total={actionsTotal} providers={providers} models={models} />
        )}
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
