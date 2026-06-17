'use client';

import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';

export function LogoutButton() {
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
        {logout.isPending ? 'Signing out...' : 'Sign out'}
      </Button>
    </form>
  );
}
