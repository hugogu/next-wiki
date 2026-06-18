'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserView } from '@next-wiki/shared';
import { useApiMutation } from '@/lib/api/client';
import { Input } from '@/components/ui/Input';
import { LockIcon, UnlockIcon, KeyIcon, CheckIcon, XIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

function IconButton({
  onClick,
  label,
  children,
  variant = 'default',
  disabled = false,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
}) {
  const baseClass =
    'inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed';
  const stateClass =
    variant === 'danger'
      ? 'text-danger hover:bg-danger/10'
      : variant === 'primary'
        ? 'text-primary hover:bg-primary/10'
        : 'text-muted hover:text-foreground hover:bg-surface-elevated';

  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`${baseClass} ${stateClass}`}>
      {children}
    </button>
  );
}

export function UserManagementTable({ users }: { users: UserView[] }) {
  const { t } = useTranslation();
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
          <p className="text-sm font-medium">{t('admin.users.resetPassword.successMessage', { email: resetResult.email })}</p>
          <code className="block mt-sm p-sm bg-background rounded text-sm break-all">{resetResult.password}</code>
          <p className="text-xs text-muted mt-sm">{t('admin.users.resetPassword.securityHint')}</p>
          <button
            type="button"
            onClick={() => setResetResult(null)}
            className="mt-sm inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label={t('common.actions.dismiss')}
            title={t('common.actions.dismiss')}
          >
            <XIcon />
          </button>
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              <th className="text-left px-md py-sm font-medium">{t('admin.users.table.email')}</th>
              <th className="text-left px-md py-sm font-medium">{t('admin.users.table.role')}</th>
              <th className="text-left px-md py-sm font-medium">{t('admin.users.table.status')}</th>
              <th className="text-left px-md py-sm font-medium">{t('admin.users.table.joined')}</th>
              <th className="text-right px-md py-sm font-medium">{t('admin.users.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-md py-sm">{user.email}</td>
                <td className="px-md py-sm">
                  <select
                    aria-label={t('admin.users.role.selectLabel', { email: user.email })}
                    value={user.role}
                    disabled={setRole.isPending}
                    onChange={(e) => handleSetRole(user.id, e.target.value as UserView['role'])}
                    className="rounded-md border border-border bg-surface px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="reader">{t('admin.users.role.reader')}</option>
                    <option value="editor">{t('admin.users.role.editor')}</option>
                    <option value="admin">{t('admin.users.role.admin')}</option>
                  </select>
                </td>
                <td className="px-md py-sm capitalize">{user.status}</td>
                <td className="px-md py-sm text-muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="px-md py-sm">
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
                          placeholder={t('admin.users.resetPassword.placeholder')}
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="w-48"
                        />
                        <IconButton label={t('admin.users.resetPassword.confirmButton')} variant="primary">
                          <CheckIcon />
                        </IconButton>
                        <IconButton
                          label={t('common.actions.cancel')}
                          onClick={() => {
                            setResettingUserId(null);
                            setTempPassword('');
                          }}
                        >
                          <XIcon />
                        </IconButton>
                      </form>
                    ) : (
                      <>
                        <IconButton
                          label={t('admin.users.resetPassword.button')}
                          onClick={() => setResettingUserId(user.id)}
                        >
                          <KeyIcon />
                        </IconButton>
                        <IconButton
                          label={user.status === 'active' ? t('admin.users.status.disable') : t('admin.users.status.enable')}
                          variant={user.status === 'active' ? 'danger' : 'primary'}
                          disabled={setStatus.isPending}
                          onClick={() =>
                            handleSetStatus(
                              user.id,
                              user.status === 'active' ? 'disabled' : 'active',
                            )
                          }
                        >
                          {user.status === 'active' ? <LockIcon /> : <UnlockIcon />}
                        </IconButton>
                      </>
                    )}
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
