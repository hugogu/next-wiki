'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserView } from '@next-wiki/shared';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function UserManagementTable({ users }: { users: UserView[] }) {
  const router = useRouter();
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  const setRole = useApiMutation<{ userId: string; role: UserView['role'] }, { ok: true }>(
    ({ userId }) => `/api/users/${encodeURIComponent(userId)}/role`,
    {
      onSuccess: () => router.refresh(),
    },
  );
  const setStatus = useApiMutation<{ userId: string; status: UserView['status'] }, { ok: true }>(
    ({ userId }) => `/api/users/${encodeURIComponent(userId)}/status`,
    {
      onSuccess: () => router.refresh(),
    },
  );
  const resetPassword = useApiMutation<{ userId: string; tempPassword: string }, { ok: true }>(
    ({ userId }) => `/api/users/${encodeURIComponent(userId)}/reset-password`,
    {
      onSuccess: () => {
        setResettingUserId(null);
        setTempPassword('');
        router.refresh();
      },
    },
  );

  const handleSetRole = (userId: string, role: UserView['role']) => {
    setRole.mutate({ userId, role });
  };

  const handleSetStatus = (userId: string, status: UserView['status']) => {
    setStatus.mutate({ userId, status });
  };

  const handleResetPassword = (userId: string, tempPassword: string, email: string) => {
    resetPassword.mutate(
      { userId, tempPassword },
      {
        onSuccess: () => {
          setResetResult({ email, password: tempPassword });
          setResettingUserId(null);
          setTempPassword('');
          router.refresh();
        },
      },
    );
  };

  return (
    <div className="space-y-md">
      {resetResult && (
        <div className="p-md bg-surface border border-border rounded-md" role="status">
          <p className="text-sm font-medium">Temporary password set for {resetResult.email}</p>
          <code className="block mt-sm p-sm bg-background rounded text-sm break-all">{resetResult.password}</code>
          <p className="text-xs text-muted mt-sm">Share this password securely. The user must set a new password on next sign-in.</p>
          <Button variant="ghost" className="mt-sm" onClick={() => setResetResult(null)}>Dismiss</Button>
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              <th className="text-left px-md py-sm font-medium">Email</th>
              <th className="text-left px-md py-sm font-medium">Role</th>
              <th className="text-left px-md py-sm font-medium">Status</th>
              <th className="text-left px-md py-sm font-medium">Joined</th>
              <th className="text-right px-md py-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-md py-sm">{user.email}</td>
                <td className="px-md py-sm">
                  <select
                    aria-label={`Change role for ${user.email}`}
                    value={user.role}
                    disabled={setRole.isPending}
                    onChange={(e) => handleSetRole(user.id, e.target.value as UserView['role'])}
                    className="rounded-md border border-border bg-surface px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="reader">Reader</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-md py-sm capitalize">{user.status}</td>
                <td className="px-md py-sm text-muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="px-md py-sm text-right">
                  <div className="flex items-center justify-end gap-sm">
                    {resettingUserId === user.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleResetPassword(user.id, tempPassword, user.email);
                        }}
                        className="flex items-center gap-sm"
                      >
                        <Input
                          type="text"
                          autoComplete="off"
                          placeholder="Temporary password"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="w-48"
                        />
                        <Button type="submit" disabled={resetPassword.isPending}>
                          {resetPassword.isPending ? 'Saving...' : 'Set'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setResettingUserId(null);
                            setTempPassword('');
                          }}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setResettingUserId(user.id)}
                      >
                        Reset password
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={user.status === 'active' ? 'danger' : 'primary'}
                      disabled={setStatus.isPending}
                      onClick={() =>
                        handleSetStatus(
                          user.id,
                          user.status === 'active' ? 'disabled' : 'active',
                        )
                      }
                    >
                      {user.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
