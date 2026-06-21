'use client';

import type {
  AiModelView,
  AiProviderType,
  AiProviderVendor,
  AiProviderView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const VENDOR_LABELS: Record<AiProviderVendor, TranslationKey> = {
  openai: 'admin.ai.vendor.openai',
  openrouter: 'admin.ai.vendor.openrouter',
  anthropic: 'admin.ai.vendor.anthropic',
  kimi: 'admin.ai.vendor.kimi',
  voyage: 'admin.ai.vendor.voyage',
  minimax: 'admin.ai.vendor.minimax',
  custom: 'admin.ai.vendor.custom',
};

export function ProviderList({
  type,
  providers,
  models,
}: {
  type: AiProviderType;
  providers: AiProviderView[];
  models: AiModelView[];
}) {
  const { t } = useTranslation();
  const items = providers.filter((provider) => provider.type === type);
  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader>{t('admin.ai.providers.name')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.providers.vendor')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.providers.models')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.providers.status')}</DataTableHeader>
          <DataTableHeader align="right">{t('admin.ai.actions.table.actions')}</DataTableHeader>
        </DataTableRow>
      </DataTableHead>
      <DataTableBody>
        {items.map((provider) => (
          <DataTableRow key={provider.id}>
            <DataTableCell>
              <p className="font-medium">{provider.name}</p>
              <p className="mt-xs max-w-xs truncate text-xs text-muted">{provider.baseUrl}</p>
            </DataTableCell>
            <DataTableCell>{t(VENDOR_LABELS[provider.vendor])}</DataTableCell>
            <DataTableCell>{models.filter((model) => model.providerId === provider.id).length}</DataTableCell>
            <DataTableCell>
              <StatusBadge
                tone={provider.status === 'healthy' ? 'success' : provider.status === 'unavailable' ? 'danger' : 'neutral'}
              >
                {t(`admin.ai.providerStatus.${provider.status}` as TranslationKey)}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell align="right">
              <Button variant="secondary" onClick={() => { window.location.href = `/admin/ai/providers/${provider.id}`; }}>
                {t('common.actions.edit')}
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
        {items.length === 0 && (
          <DataTableRow>
            <DataTableCell colSpan={5} className="py-xl text-center text-muted">
              {t(`admin.ai.providers.empty.${type}` as TranslationKey)}
            </DataTableCell>
          </DataTableRow>
        )}
      </DataTableBody>
    </DataTable>
  );
}
