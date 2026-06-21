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

type AiAdminTab = 'providers' | 'models' | 'indexes' | 'actions';
const TABS: AiAdminTab[] = ['providers', 'models', 'indexes', 'actions'];

function parseTab(value: string | null): AiAdminTab {
  return TABS.includes(value as AiAdminTab) ? (value as AiAdminTab) : 'providers';
}

export function AiAdminTabs({
  providers,
  models,
  assignments,
  indexes,
  actions,
}: {
  providers: AiProviderView[];
  models: AiModelView[];
  assignments: Array<{ purpose: AiPurpose; modelId: string }>;
  indexes: AiIndexView[];
  actions: AiActionView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = parseTab(searchParams.get('tab'));
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [providerType, setProviderType] = useState<AiProviderType>('chat');
  const selectTab = (tab: AiAdminTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (searchParams.get('tab')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'providers');
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const tabs = [
    { id: 'providers' as const, label: t('admin.ai.tabs.providers'), status: String(providers.length) },
    { id: 'models' as const, label: t('admin.ai.tabs.models'), status: String(models.length) },
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
        {selected === 'providers' && (
          <section className="space-y-md">
            <div>
              <h2 className="font-display text-lg font-semibold">{t('admin.ai.providers.title')}</h2>
              <p className="mt-xs text-sm text-muted">{t('admin.ai.providers.description')}</p>
            </div>
            {(['chat', 'embedding', 'image'] as const).map((type) => (
              <section key={type} className="space-y-sm">
                <div className="flex items-start justify-between gap-md">
                  <div>
                    <h3 className="font-display text-base font-semibold">
                      {t(`admin.ai.providerType.${type}`)}
                    </h3>
                    <p className="mt-xs text-xs text-muted">
                      {t(`admin.ai.providerType.${type}Description`)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setProviderType(type);
                      setAddProviderOpen(true);
                    }}
                  >
                    <PlusIcon className="mr-xs h-4 w-4" />
                    {t('admin.ai.providers.add')}
                  </Button>
                </div>
                <ProviderList type={type} providers={providers} models={models} />
              </section>
            ))}
          </section>
        )}
        {selected === 'models' && (
          <>
            <PurposeAssignments models={models} assignments={assignments} />
            <ModelCatalog models={models} />
          </>
        )}
        {selected === 'indexes' && <IndexList indexes={indexes} />}
        {selected === 'actions' && <AiActionAuditTable actions={actions} />}
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
