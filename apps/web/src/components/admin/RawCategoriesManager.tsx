'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import {
  ArchiveIcon,
  CheckIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { apiDelete, apiGet, apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type RawCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  isRetired: boolean;
  entryCount: number;
  createdAt: string;
};

type FormState = { id: string | null; name: string; slug: string; description: string; isDefault: boolean };

const EMPTY_FORM: FormState = { id: null, name: '', slug: '', description: '', isDefault: false };

function formatCreatedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function RawCategoriesManager({
  initial,
  title,
  description,
}: {
  initial: RawCategory[];
  title: string;
  description: string;
}) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'retire' | 'delete'; category: RawCategory } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: categories = initial } = useQuery({
    queryKey: ['raw-categories'],
    queryFn: () => apiGet<{ items: RawCategory[] }>('/api/settings/raw-categories').then((r) => r.items),
    initialData: initial,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['raw-categories'] });

  const run = async (op: () => Promise<unknown>) => {
    setError(null);
    setPending(true);
    try {
      await op();
      await refresh();
      setForm(null);
      setConfirm(null);
    } catch (e) {
      const apiError = e as ApiError;
      setError(
        apiError.code === 'RAW_CATEGORY_HAS_ENTRIES'
          ? t('admin.rawCategories.error.hasEntries')
          : (apiError.message ?? String(e)),
      );
    } finally {
      setPending(false);
    }
  };

  const submitForm = () => {
    if (!form) return;
    const body = { name: form.name, slug: form.slug, description: form.description || null, isDefault: form.isDefault };
    void run(() =>
      form.id
        ? apiPatch(`/api/settings/raw-categories/${form.id}`, body)
        : apiPost('/api/settings/raw-categories', body),
    );
  };

  return (
    <section className="max-w-4xl space-y-md">
      {error && <Alert>{error}</Alert>}

      <header className="flex items-start justify-between gap-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{description}</p>
        </div>
        <Tooltip label={t('admin.rawCategories.actions.create')}>
          <Button onClick={() => { setError(null); setForm({ ...EMPTY_FORM }); }}>
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {t('admin.rawCategories.actions.create')}
          </Button>
        </Tooltip>
      </header>

      {categories.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.rawCategories.empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('admin.rawCategories.columns.name')}</DataTableHeader>
              <DataTableHeader>{t('admin.rawCategories.columns.slug')}</DataTableHeader>
              <DataTableHeader align="right">{t('admin.rawCategories.columns.entries')}</DataTableHeader>
              <DataTableHeader>{t('admin.rawCategories.columns.created')}</DataTableHeader>
              <DataTableHeader>{t('admin.rawCategories.columns.status')}</DataTableHeader>
              <DataTableHeader align="right">{t('admin.rawCategories.columns.actions')}</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {categories.map((category) => (
              <DataTableRow key={category.id}>
                <DataTableCell className="font-medium">{category.name}</DataTableCell>
                <DataTableCell className="font-mono text-muted">{category.slug}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{category.entryCount}</DataTableCell>
                <DataTableCell className="whitespace-nowrap text-muted">
                  {formatCreatedAt(category.createdAt, locale)}
                </DataTableCell>
                <DataTableCell>
                  {category.isDefault && <StatusBadge tone="info">{t('admin.rawCategories.status.default')}</StatusBadge>}
                  {category.isRetired && <StatusBadge tone="neutral">{t('admin.rawCategories.status.retired')}</StatusBadge>}
                  {!category.isDefault && !category.isRetired && (
                    <StatusBadge tone="success">{t('admin.rawCategories.status.active')}</StatusBadge>
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  <div className="flex flex-wrap justify-end gap-xs">
                    <Tooltip label={t('admin.rawCategories.actions.rename')}>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('admin.rawCategories.actions.rename')}
                        onClick={() => {
                          setError(null);
                          setForm({
                            id: category.id,
                            name: category.name,
                            slug: category.slug,
                            description: category.description ?? '',
                            isDefault: category.isDefault,
                          });
                        }}
                      >
                        <EditIcon className="h-5 w-5" aria-hidden="true" />
                      </Button>
                    </Tooltip>
                    {!category.isDefault && !category.isRetired && (
                      <Tooltip label={t('admin.rawCategories.actions.setDefault')}>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('admin.rawCategories.actions.setDefault')}
                          onClick={() =>
                            void run(() => apiPatch(`/api/settings/raw-categories/${category.id}`, { isDefault: true }))
                          }
                        >
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </Button>
                      </Tooltip>
                    )}
                    {!category.isRetired && (
                      <Tooltip label={t('admin.rawCategories.actions.retire')}>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('admin.rawCategories.actions.retire')}
                          onClick={() => {
                            setError(null);
                            setConfirm({ kind: 'retire', category });
                          }}
                        >
                          <ArchiveIcon className="h-5 w-5" aria-hidden="true" />
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip label={t('admin.rawCategories.actions.delete')}>
                      <Button
                        size="icon"
                        variant="danger"
                        aria-label={t('admin.rawCategories.actions.delete')}
                        onClick={() => {
                          setError(null);
                          setConfirm({ kind: 'delete', category });
                        }}
                      >
                        <TrashIcon className="h-5 w-5" aria-hidden="true" />
                      </Button>
                    </Tooltip>
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {form && (
        <ModalDialog
          title={form.id ? t('admin.rawCategories.dialog.editTitle') : t('admin.rawCategories.dialog.title')}
          onClose={() => setForm(null)}
        >
          <div className="space-y-md">
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.rawCategories.dialog.name')}</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.rawCategories.dialog.slug')}</span>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </label>
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.rawCategories.dialog.description')}</span>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="flex items-center gap-sm">
              <Switch checked={form.isDefault} onClick={() => setForm({ ...form, isDefault: !form.isDefault })} />
              <span className="text-sm">{t('admin.rawCategories.dialog.default')}</span>
            </div>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => setForm(null)}>{t('common.actions.cancel')}</Button>
              <Button onClick={submitForm} disabled={pending || !form.name || !form.slug}>
                {t('admin.rawCategories.dialog.submit')}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'retire' ? t('admin.rawCategories.confirm.retireTitle') : t('admin.rawCategories.confirm.deleteTitle')}
          message={confirm.kind === 'retire'
            ? t('admin.rawCategories.confirm.retireMessage', { name: confirm.category.name })
            : t('admin.rawCategories.confirm.deleteMessage', { name: confirm.category.name })}
          confirmVariant="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(() =>
            confirm.kind === 'retire'
              ? apiPatch(`/api/settings/raw-categories/${confirm.category.id}`, { isRetired: true })
              : apiDelete(`/api/settings/raw-categories/${confirm.category.id}`),
          )}
        />
      )}
    </section>
  );
}
