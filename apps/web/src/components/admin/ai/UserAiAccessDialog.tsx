'use client';

import { useQuery } from '@tanstack/react-query';
import type { AiEntitlementView, UserView } from '@next-wiki/shared';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { UserAiEntitlementsForm } from './UserAiEntitlementsForm';
import { apiGet } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

/**
 * In-table popup for managing a user's per-feature AI access. Fetches the
 * entitlements when opened and renders the auto-saving form inside a
 * ModalDialog. Reuses the same form component as the standalone AI page.
 */
export function UserAiAccessDialog({ user, onClose }: { user: UserView; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-entitlements', user.id],
    queryFn: () => apiGet<AiEntitlementView>(`/api/ai/entitlements/${encodeURIComponent(user.id)}`),
    staleTime: 0,
    retry: false,
  });

  return (
    <ModalDialog
      title={t('admin.ai.entitlement.dialogTitle', { email: user.email })}
      description={t('admin.ai.entitlement.dialogDescription')}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      {isLoading ? (
        <p className="text-sm text-muted">{t('admin.ai.entitlement.loading')}</p>
      ) : error ? (
        <p className="text-sm text-danger">{t('admin.ai.entitlement.loadError')}</p>
      ) : data ? (
        <UserAiEntitlementsForm initial={data} />
      ) : null}
    </ModalDialog>
  );
}
