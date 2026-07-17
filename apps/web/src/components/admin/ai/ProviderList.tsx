'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AiModelSyncResult,
  AiModelView,
  AiProviderHealth,
  AiProviderType,
  AiProviderVendor,
  AiProviderView,
} from '@next-wiki/shared';
import { apiDelete, apiPost, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { EditIcon, LinkIcon, RedoIcon, TrashIcon } from '@/components/icons';
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
import { ProviderDetail } from './ProviderDetail';

const VENDOR_LABELS: Record<AiProviderVendor, TranslationKey> = {
  openai: 'admin.ai.vendor.openai',
  openrouter: 'admin.ai.vendor.openrouter',
  anthropic: 'admin.ai.vendor.anthropic',
  kimi: 'admin.ai.vendor.kimi',
  voyage: 'admin.ai.vendor.voyage',
  minimax: 'admin.ai.vendor.minimax',
  zai: 'admin.ai.vendor.zai',
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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [deleting, setDeleting] = useState<AiProviderView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const items = providers.filter((provider) => provider.type === type);

  const runTest = async (provider: AiProviderView) => {
    setBusy(`${provider.id}:test`);
    setFeedback(null);
    try {
      const health = await apiPost<unknown, AiProviderHealth>('/api/ai/providers/test', {
        mode: 'existing',
        providerId: provider.id,
      });
      setFeedback(
        health.ok
          ? { ok: true, text: `${provider.name}: ${t('admin.ai.providers.testOk', { latency: health.latencyMs })}` }
          : {
              ok: false,
              text: `${provider.name}: ${t('admin.ai.providers.testFailed', { detail: health.errorMessage ?? health.errorCode ?? '' })}`,
            },
      );
      router.refresh();
    } catch (value) {
      setFeedback({ ok: false, text: (value as ApiError).message ?? t('admin.ai.error.generic') });
    } finally {
      setBusy(null);
    }
  };

  const runSync = async (provider: AiProviderView) => {
    setBusy(`${provider.id}:sync`);
    setFeedback(null);
    try {
      // Detector-backed providers return a queued model_sync action (202);
      // inline syncs return the result directly. Distinguish by the action's
      // `feature` marker so the admin sees the right feedback either way.
      const result = await apiPost<Record<string, never>, AiModelSyncResult & { feature?: string }>(
        `/api/ai/providers/${provider.id}/model-syncs`,
        {},
      );
      setFeedback({
        ok: true,
        text: `${provider.name}: ${
          result.feature === 'model_sync'
            ? t('admin.ai.providers.syncStarted')
            : t('admin.ai.providers.syncComplete', { count: result.count, skipped: result.skipped })
        }`,
      });
      router.refresh();
    } catch (value) {
      setFeedback({ ok: false, text: (value as ApiError).message ?? t('admin.ai.error.generic') });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: AiProviderView) => {
    setBusy(`${provider.id}:delete`);
    setDeleteError(null);
    try {
      await apiDelete(`/api/ai/providers/${provider.id}`);
      setDeleting(null);
      router.refresh();
    } catch (value) {
      setDeleteError(
        (value as ApiError).code === 'PROVIDER_IN_USE'
          ? t('admin.ai.error.inUse')
          : (value as ApiError).message ?? t('admin.ai.error.generic'),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {feedback && (
        <p className={`mb-sm text-sm ${feedback.ok ? 'text-success' : 'text-danger'}`}>{feedback.text}</p>
      )}
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
                <div className="flex justify-end gap-xs">
                  <Tooltip label={t('admin.ai.providers.test')}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('admin.ai.providers.test')}
                      disabled={!provider.enabled || busy === `${provider.id}:test`}
                      onClick={() => void runTest(provider)}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip label={t('admin.ai.providers.sync')}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('admin.ai.providers.sync')}
                      disabled={!provider.enabled || busy === `${provider.id}:sync`}
                      onClick={() => void runSync(provider)}
                    >
                      <RedoIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip label={t('common.actions.edit')}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('common.actions.edit')}
                      onClick={() => setEditing(provider)}
                    >
                      <EditIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip label={t('admin.ai.providers.delete')}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('admin.ai.providers.delete')}
                      disabled={busy === `${provider.id}:delete`}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(provider);
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </div>
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

      {editing && (
        <ModalDialog
          title={editing.name}
          description={t('admin.ai.providerDetail.update')}
          onClose={() => setEditing(null)}
        >
          <ProviderDetail
            provider={editing}
            onUpdated={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        </ModalDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={t('admin.ai.providers.delete')}
          message={t('admin.ai.providers.deleteConfirm', { name: deleting.name })}
          confirmLabel={t('admin.ai.providers.delete')}
          confirmVariant="danger"
          pending={busy === `${deleting.id}:delete`}
          error={deleteError ?? undefined}
          onCancel={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </>
  );
}
