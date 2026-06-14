'use client';

import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/Button';

export function LogoutButton() {
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = '/';
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        logout.mutate();
      }}
    >
      <Button type="submit" variant="ghost" disabled={logout.isPending}>
        {logout.isPending ? 'Signing out...' : 'Sign out'}
      </Button>
    </form>
  );
}
