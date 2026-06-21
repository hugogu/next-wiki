'use client';

import type {
  AiModelDiscovery,
  AiModelView,
  AiProviderKind,
  AiProviderType,
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

const PROTOCOL_LABELS: Record<AiProviderKind, TranslationKey> = {
  openai_compatible: 'admin.ai.providerProtocol.openaiCompatible',
  openrouter: 'admin.ai.providerProtocol.openrouter',
  anthropic: 'admin.ai.providerProtocol.anthropic',
  voyage: 'admin.ai.providerProtocol.voyage',
  minimax: 'admin.ai.providerProtocol.minimax',
};

const DISCOVERY_LABELS: Record<AiModelDiscovery, TranslationKey> = {
  openai: 'admin.ai.modelDiscovery.openai',
  openrouter: 'admin.ai.modelDiscovery.openrouter',
  anthropic: 'admin.ai.modelDiscovery.anthropic',
  none: 'admin.ai.modelDiscovery.none',
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
          <DataTableHeader>{t('admin.ai.providers.protocol')}</DataTableHeader>
          <DataTableHeader>{t('admin.ai.providers.modelDiscovery')}</DataTableHeader>
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
            <DataTableCell>{t(PROTOCOL_LABELS[provider.kind])}</DataTableCell>
            <DataTableCell>{t(DISCOVERY_LABELS[provider.modelDiscovery])}</DataTableCell>
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
            <DataTableCell colSpan={6} className="py-xl text-center text-muted">
              {t(`admin.ai.providers.empty.${type}` as TranslationKey)}
            </DataTableCell>
          </DataTableRow>
        )}
      </DataTableBody>
    </DataTable>
  );
}
