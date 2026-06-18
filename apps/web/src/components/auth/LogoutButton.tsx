'use client';

import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';

export function LogoutButton() {
  const { t } = useTranslation();
  const logout = useApiMutation<Record<string, never>, { ok: true }>('/api/auth/logout', {
    onSuccess: () => {
      window.location.href = '/';
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        logout.mutate({});
      }}
    >
      <Button type="submit" variant="ghost" disabled={logout.isPending}>
        {logout.isPending ? t('auth.logout.button.submitting') : t('auth.logout.button.submit')}
      </Button>
    </form>
  );
}
