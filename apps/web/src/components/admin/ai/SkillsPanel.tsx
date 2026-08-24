'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SkillCatalogue, SkillSummary } from '@next-wiki/shared';
import { apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/Switch';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { PlusIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

/**
 * The Skills catalogue (028, US2).
 *
 * Shows every known skill with its source and state, the mount status, and any
 * package that was rejected during discovery. Rejections are first-class here:
 * a skill that failed to load silently is the thing this surface exists to
 * prevent.
 */
export function SkillsPanel({ catalogue, canManage = true }: { catalogue: SkillCatalogue; canManage?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.skills.error.generic'));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (skill: SkillSummary) =>
    run(`${skill.name}:enabled`, () =>
      apiPatch(`/api/ai/skills/${skill.name}`, { enabled: !skill.enabled }),
    );

  const create = () =>
    run('create', async () => {
      await apiPost('/api/ai/skills', { name, description });
      setCreateOpen(false);
      setName('');
      setDescription('');
    });

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <p className="text-sm text-muted">{t('admin.ai.skills.intro')}</p>
        {canManage && <div className="flex gap-sm">
          <Button
            variant="secondary"
            disabled={busy === 'rescan'}
            onClick={() => void run('rescan', () => apiPost('/api/ai/skills/rescan', {}))}
          >
            {t('admin.ai.skills.rescan')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            {t('admin.ai.skills.create')}
          </Button>
        </div>}
      </div>

      {error && <Alert>{error}</Alert>}

      {catalogue.directory.notice && (
        <p className="rounded-md border border-border p-md text-sm text-muted">
          {catalogue.directory.notice}
          {canManage && catalogue.directory.hostPath && (
            <span className="ml-xs">({catalogue.directory.hostPath})</span>
          )}
        </p>
      )}

      {catalogue.skills.length === 0 ? (
        <EmptyState title={t('admin.ai.skills.empty')} />
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('admin.ai.skills.name')}</DataTableHeader>
              <DataTableHeader className="w-px">{t('admin.ai.skills.source')}</DataTableHeader>
              <DataTableHeader className="w-px">{t('admin.ai.skills.files')}</DataTableHeader>
              <DataTableHeader className="w-px">{t('admin.ai.skills.lastUsed')}</DataTableHeader>
              <DataTableHeader align="right" className="w-px">
                {t('admin.ai.skills.enabled')}
              </DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {catalogue.skills.map((skill) => (
              <DataTableRow key={skill.name}>
                <DataTableCell>
                  {canManage ? <Link href={`/admin/ai/skills/${skill.name}`} className="font-medium">
                    {skill.name}
                  </Link> : <span className="font-medium">{skill.name}</span>}
                  <p className="text-xs text-muted">{skill.description}</p>
                </DataTableCell>
                <DataTableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-xs">
                    <StatusBadge tone={skill.source === 'directory' ? 'info' : 'neutral'}>
                      {t(`admin.ai.skills.sourceLabel.${skill.source}` as never)}
                    </StatusBadge>
                    {skill.overridden && (
                      <StatusBadge tone="warning">{t('admin.ai.skills.overridden')}</StatusBadge>
                    )}
                    {!skill.editable && (
                      <StatusBadge tone="neutral">{t('admin.ai.skills.readOnly')}</StatusBadge>
                    )}
                  </div>
                </DataTableCell>
                <DataTableCell className="whitespace-nowrap">{skill.fileCount}</DataTableCell>
                <DataTableCell className="whitespace-nowrap">
                  {skill.lastUsedAt
                    ? new Date(skill.lastUsedAt).toLocaleString()
                    : t('admin.ai.skills.neverUsed')}
                </DataTableCell>
                <DataTableCell align="right">
                  <Switch
                    checked={skill.enabled}
                    disabled={!canManage || busy === `${skill.name}:enabled`}
                    aria-label={`${skill.name}: ${t('admin.ai.skills.enabled')}`}
                    onClick={() => void toggle(skill)}
                  />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {catalogue.rejected.length > 0 && (
        <section className="flex flex-col gap-sm">
          <h3 className="text-sm font-medium">{t('admin.ai.skills.rejected')}</h3>
          <p className="text-xs text-muted">{t('admin.ai.skills.rejectedHint')}</p>
          <ul className="flex flex-col gap-xs">
            {catalogue.rejected.map((rejection, index) => (
              <li
                key={`${rejection.origin.directory ?? rejection.name ?? 'unknown'}:${index}`}
                className="rounded-md border border-border p-sm text-xs"
              >
                <div className="flex flex-wrap items-center gap-xs">
                  <StatusBadge tone="danger">
                    {t(`admin.ai.skills.rejectReason.${rejection.reason}` as never)}
                  </StatusBadge>
                  {rejection.name && <span className="font-medium">{rejection.name}</span>}
                  {canManage && rejection.origin.directory && (
                    <code className="text-muted">{rejection.origin.directory}</code>
                  )}
                </div>
                <p className="mt-xs text-muted">{rejection.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {createOpen && (
        <ModalDialog onClose={() => setCreateOpen(false)} title={t('admin.ai.skills.create')}>
          <div className="flex flex-col gap-md">
            <label className="flex flex-col gap-xs text-sm">
              {t('admin.ai.skills.name')}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="release-notes"
              />
            </label>
            <label className="flex flex-col gap-xs text-sm">
              {t('admin.ai.skills.description')}
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('admin.ai.skills.descriptionHint')}
              />
            </label>
            <p className="text-xs text-muted">{t('admin.ai.skills.descriptionMatters')}</p>
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button disabled={!name || !description || busy === 'create'} onClick={() => void create()}>
                {t('common.actions.save')}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
