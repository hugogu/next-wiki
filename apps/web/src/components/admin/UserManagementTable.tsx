'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserView } from '@next-wiki/shared';
import { useApiMutation } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { UserAiAccessDialog } from '@/components/admin/ai/UserAiAccessDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LockIcon, UnlockIcon, KeyIcon, CheckIcon, XIcon, SettingsIcon, TrashIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

export function UserManagementTable({ users }: { users: UserView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [aiUser, setAiUser] = useState<UserView | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserView | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'reader' as UserView['role'] });

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
  const deleteUser = useApiMutation<{ userId: string }, { ok: true }>(
    ({ userId }) => `/api/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      onSuccess: () => {
        setDeletingUser(null);
        router.refresh();
      },
    },
  );
  const createUser = useApiMutation<typeof newUser, UserView>('/api/users', {
    onSuccess: () => {
      setNewUser({ email: '', password: '', role: 'reader' });
      router.refresh();
    },
  });

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
      <form
        className="flex flex-wrap items-end gap-sm rounded-md border border-border bg-surface p-md"
        onSubmit={(event) => {
          event.preventDefault();
          createUser.mutate(newUser);
        }}
      >
        <label className="min-w-52 flex-1 text-sm">
          <span className="mb-xs block font-medium">{t('admin.users.create.email')}</span>
          <Input type="email" autoComplete="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
        </label>
        <label className="min-w-52 flex-1 text-sm">
          <span className="mb-xs block font-medium">{t('admin.users.create.password')}</span>
          <Input type="password" autoComplete="new-password" minLength={8} required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
        </label>
        <label className="w-32 text-sm">
          <span className="mb-xs block font-medium">{t('admin.users.create.role')}</span>
          <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserView['role'] })}>
            <option value="reader">{t('admin.users.role.reader')}</option>
            <option value="editor">{t('admin.users.role.editor')}</option>
            <option value="admin">{t('admin.users.role.admin')}</option>
          </Select>
        </label>
        <Button type="submit" disabled={createUser.isPending}>{t('admin.users.create.submit')}</Button>
        {createUser.error ? <p role="alert" className="w-full text-sm text-danger">{createUser.error.message}</p> : null}
        <p className="w-full text-xs text-muted">{t('admin.users.create.hint')}</p>
      </form>
      {resetResult && (
        <div className="p-md bg-surface border border-border rounded-md" role="status">
          <p className="text-sm font-medium">{t('admin.users.resetPassword.successMessage', { email: resetResult.email })}</p>
          <code className="block mt-sm p-sm bg-background rounded text-sm break-all">{resetResult.password}</code>
          <p className="text-xs text-muted mt-sm">{t('admin.users.resetPassword.securityHint')}</p>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setResetResult(null)}
            aria-label={t('common.actions.dismiss')}
            title={t('common.actions.dismiss')}
            className="mt-sm"
          >
            <XIcon />
          </Button>
        </div>
      )}

      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeader>{t('admin.users.table.email')}</DataTableHeader>
            <DataTableHeader>{t('admin.users.table.role')}</DataTableHeader>
            <DataTableHeader>{t('admin.users.table.status')}</DataTableHeader>
            <DataTableHeader>{t('admin.users.table.joined')}</DataTableHeader>
            <DataTableHeader>{t('admin.users.table.lastLogin')}</DataTableHeader>
            <DataTableHeader align="right">{t('admin.users.table.actions')}</DataTableHeader>
          </tr>
        </DataTableHead>
        <DataTableBody>
            {users.map((user) => (
              <DataTableRow key={user.id}>
                <DataTableCell>{user.email}</DataTableCell>
                <DataTableCell>
                  <Select
                    aria-label={t('admin.users.role.selectLabel', { email: user.email })}
                    value={user.role}
                    disabled={setRole.isPending}
                    onChange={(e) => handleSetRole(user.id, e.target.value as UserView['role'])}
                    containerClassName="w-32"
                    className="py-xs"
                  >
                    <option value="reader">{t('admin.users.role.reader')}</option>
                    <option value="editor">{t('admin.users.role.editor')}</option>
                    <option value="admin">{t('admin.users.role.admin')}</option>
                  </Select>
                </DataTableCell>
                <DataTableCell className="capitalize">{user.status}</DataTableCell>
                <DataTableCell className="text-muted">{new Date(user.createdAt).toLocaleDateString()}</DataTableCell>
                <DataTableCell className="text-muted">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
                </DataTableCell>
                <DataTableCell>
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
                        <Button
                          size="icon"
                          variant="ghost"
                          type="submit"
                          aria-label={t('admin.users.resetPassword.confirmButton')}
                          title={t('admin.users.resetPassword.confirmButton')}
                        >
                          <CheckIcon />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('common.actions.cancel')}
                          title={t('common.actions.cancel')}
                          onClick={() => {
                            setResettingUserId(null);
                            setTempPassword('');
                          }}
                        >
                          <XIcon />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('admin.ai.entitlement.manage')}
                          title={t('admin.ai.entitlement.manage')}
                          onClick={() => setAiUser(user)}
                        >
                          <SettingsIcon />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('admin.users.resetPassword.button')}
                          title={t('admin.users.resetPassword.button')}
                          onClick={() => setResettingUserId(user.id)}
                        >
                          <KeyIcon />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={user.status === 'active' ? t('admin.users.status.disable') : t('admin.users.status.enable')}
                          title={user.status === 'active' ? t('admin.users.status.disable') : t('admin.users.status.enable')}
                          disabled={setStatus.isPending}
                          onClick={() =>
                            handleSetStatus(
                              user.id,
                              user.status === 'active' ? 'disabled' : 'active',
                            )
                          }
                        >
                          {user.status === 'active' ? <LockIcon /> : <UnlockIcon />}
                        </Button>
                        <button
                          type="button"
                          aria-label={t('admin.users.delete.button')}
                          title={t('admin.users.delete.button')}
                          disabled={deleteUser.isPending}
                          onClick={() => setDeletingUser(user)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
        </DataTableBody>
      </DataTable>

      {aiUser && <UserAiAccessDialog user={aiUser} onClose={() => setAiUser(null)} />}

      {deletingUser && (
        <ConfirmDialog
          title={t('admin.users.delete.title')}
          message={t('admin.users.delete.message', { email: deletingUser.email })}
          confirmLabel={t('admin.users.delete.confirm')}
          confirmVariant="danger"
          pending={deleteUser.isPending}
          error={deleteUser.error ? (deleteUser.error.message || t('admin.users.delete.error')) : undefined}
          onConfirm={() => deleteUser.mutate({ userId: deletingUser.id })}
          onCancel={() => {
            if (!deleteUser.isPending) {
              deleteUser.reset();
              setDeletingUser(null);
            }
          }}
        />
      )}
    </div>
  );
}
