'use client';

import { useState, type FormEvent } from 'react';
import { EditIcon, InfoIcon } from '@/components/icons';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTranslation } from '@/i18n/client';

export type SpaceSettingsItem = {
  id: string;
  kind: 'wiki' | 'generated' | 'raw';
  displayName: string;
  routePrefix: string;
  defaultVisibility: 'public' | 'registered' | 'restricted';
  isActive: boolean;
};

type SpaceSettingsResponse = Partial<SpaceSettingsItem> & { message?: string };

export function SpaceSettingsPanel({ initialSpaces }: { initialSpaces: SpaceSettingsItem[] }) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState(initialSpaces);
  const [editingSpace, setEditingSpace] = useState<SpaceSettingsItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateEditingSpace(field: keyof Pick<SpaceSettingsItem, 'displayName' | 'routePrefix' | 'defaultVisibility'>, value: string) {
    setEditingSpace((current) => current ? { ...current, [field]: value } : null);
  }

  async function saveEditingSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSpace) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/spaces/${editingSpace.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: editingSpace.displayName,
          routePrefix: editingSpace.routePrefix,
          defaultVisibility: editingSpace.defaultVisibility,
        }),
      });
      const body = await response.json().catch(() => null) as SpaceSettingsResponse | null;
      if (!response.ok) throw new Error(body?.message ?? t('admin.spaces.saveError'));

      setSpaces((current) => current.map((space) => space.id === editingSpace.id ? { ...space, ...editingSpace, ...body } : space));
      setEditingSpace(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('admin.spaces.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-md" aria-label={t('admin.spaces.ariaLabel')}>
      <header className="flex items-start justify-between gap-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.spaces.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">
            {t('admin.spaces.description')}
          </p>
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>{t('admin.spaces.table.name')}</DataTableHeader>
            <DataTableHeader>{t('admin.spaces.table.type')}</DataTableHeader>
            <DataTableHeader>{t('admin.spaces.table.urlPrefix')}</DataTableHeader>
            <DataTableHeader>
              <span className="inline-flex items-center gap-xs">
                {t('admin.spaces.table.newPageVisibility')}
                <Tooltip label={t('admin.spaces.visibilityHelp')}>
                  <button
                    type="button"
                    className="inline-flex rounded-sm text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label={t('admin.spaces.explainVisibility')}
                  >
                    <InfoIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              </span>
            </DataTableHeader>
            <DataTableHeader>{t('admin.spaces.table.status')}</DataTableHeader>
            <DataTableHeader align="right">{t('admin.spaces.table.actions')}</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {spaces.map((space) => (
            <DataTableRow key={space.id}>
              <DataTableCell className="font-medium">{space.displayName}</DataTableCell>
              <DataTableCell className="text-muted">
                {space.kind === 'wiki'
                  ? t('layout.nav.spaces.wiki')
                  : space.kind === 'generated'
                    ? t('layout.nav.spaces.generated')
                    : t('layout.nav.spaces.raw')}
              </DataTableCell>
              <DataTableCell className="font-mono text-muted">/{space.routePrefix}</DataTableCell>
              <DataTableCell>{t(`admin.spaces.visibility.${space.defaultVisibility}`)}</DataTableCell>
              <DataTableCell>
                <StatusBadge tone={space.isActive ? 'success' : 'neutral'}>
                  {space.isActive ? t('admin.spaces.status.active') : t('admin.spaces.status.inactive')}
                </StatusBadge>
              </DataTableCell>
              <DataTableCell align="right">
                <Tooltip label={t('admin.spaces.edit', { name: space.displayName })}>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('admin.spaces.edit', { name: space.displayName })}
                    onClick={() => {
                      setError(null);
                      setEditingSpace({ ...space });
                    }}
                  >
                    <EditIcon className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </Tooltip>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {editingSpace ? (
        <ModalDialog
          title={t('admin.spaces.editTitle', { name: editingSpace.displayName })}
          description={t('admin.spaces.editDescription')}
          onClose={() => setEditingSpace(null)}
          maxWidth="max-w-md"
        >
          <form className="space-y-md" onSubmit={(event) => void saveEditingSpace(event)}>
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.spaces.displayName')}</span>
              <Input
                value={editingSpace.displayName}
                onChange={(event) => updateEditingSpace('displayName', event.target.value)}
              />
            </label>
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.spaces.urlPrefix')}</span>
              <Input
                value={editingSpace.routePrefix}
                onChange={(event) => updateEditingSpace('routePrefix', event.target.value)}
              />
            </label>
            <label className="block space-y-xs text-sm font-medium">
              <span className="inline-flex items-center gap-xs">
                {t('admin.spaces.table.newPageVisibility')}
                <Tooltip label={t('admin.spaces.visibilityHelp')}>
                  <span className="inline-flex text-muted" aria-label={t('admin.spaces.explainVisibility')}>
                    <InfoIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Tooltip>
              </span>
              <Select
                value={editingSpace.defaultVisibility}
                onChange={(event) => updateEditingSpace('defaultVisibility', event.target.value)}
              >
                <option value="restricted">{t('admin.spaces.visibility.restricted')}</option>
                <option value="registered">{t('admin.spaces.visibility.registered')}</option>
                <option value="public">{t('admin.spaces.visibility.public')}</option>
              </Select>
            </label>
            <div className="flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => setEditingSpace(null)} disabled={saving}>{t('common.actions.cancel')}</Button>
              <Button type="submit" disabled={saving}>{saving ? t('common.status.saving') : t('common.actions.save')}</Button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </section>
  );
}
