import Link from 'next/link';
import type { AdminPageListResult, AdminPageSortKey } from '@next-wiki/shared';
import type { TranslateFunction, TranslationKey } from '@/i18n/types';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { EditIcon, EyeIcon } from '@/components/icons';
import { getEditHref, getPageHref } from '@/lib/path';
import { AdminPageStats } from './AdminPageStats';
import { DeletePageButton } from './DeletePageButton';

type QueryMap = Record<string, string | undefined>;

function buildAdminPagesHref(query: QueryMap, overrides: QueryMap): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/admin/pages?${qs}` : '/admin/pages';
}

function SortHeader({
  t,
  query,
  list,
  sort,
  children,
}: {
  t: TranslateFunction;
  query: QueryMap;
  list: AdminPageListResult;
  sort: AdminPageSortKey;
  children: React.ReactNode;
}) {
  const active = list.sort === sort;
  const nextDirection = active && list.direction === 'asc' ? 'desc' : 'asc';
  const label = active ? `${children} (${list.direction})` : children;

  return (
    <Link
      href={buildAdminPagesHref(query, { sort, direction: nextDirection, page: undefined })}
      className="inline-flex items-center gap-xs rounded-sm text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label={t('admin.pages.sortBy', { column: String(children) })}
    >
      {label}
    </Link>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {children}
    </Link>
  );
}

export function AdminPagesPanel({
  t,
  list,
  query,
}: {
  t: TranslateFunction;
  list: AdminPageListResult;
  query: QueryMap;
}) {
  return (
    <div className="space-y-md">
      <div className="grid gap-md lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] lg:items-start">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.pages.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.pages.description')}</p>
        </div>
        <AdminPageStats />
      </div>

      <form action="/admin/pages" className="rounded-md border border-border bg-surface p-md">
        <input type="hidden" name="sort" value={list.sort} />
        <input type="hidden" name="direction" value={list.direction} />
        <div className="grid gap-sm md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.title')}</span>
            <input
              name="title"
              defaultValue={list.filters.title ?? ''}
              className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
            />
          </label>
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.author')}</span>
            <input
              name="author"
              defaultValue={list.filters.author ?? ''}
              className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
            />
          </label>
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.path')}</span>
            <input
              name="path"
              defaultValue={list.filters.path ?? ''}
              className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
            />
          </label>
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.dateFrom')}</span>
            <input
              type="date"
              name="dateFrom"
              defaultValue={list.filters.dateFrom ?? ''}
              className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
            />
          </label>
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.dateTo')}</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={list.filters.dateTo ?? ''}
              className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
            />
          </label>
        </div>
        <div className="mt-md flex justify-end gap-sm">
          <Link
            href="/admin/pages"
            className="inline-flex h-9 items-center rounded-md px-md text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
          >
            {t('admin.pages.filters.reset')}
          </Link>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-md text-sm font-medium text-primary-text hover:opacity-90"
          >
            {t('admin.pages.filters.apply')}
          </button>
        </div>
      </form>

      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeader>
              <SortHeader t={t} query={query} list={list} sort="title">{t('admin.pages.table.title')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader>
              <SortHeader t={t} query={query} list={list} sort="path">{t('admin.pages.table.path')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader>{t('admin.pages.table.status')}</DataTableHeader>
            <DataTableHeader>
              <SortHeader t={t} query={query} list={list} sort="author">{t('admin.pages.table.author')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader align="right">
              <SortHeader t={t} query={query} list={list} sort="edits">{t('admin.pages.table.edits')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader>
              <SortHeader t={t} query={query} list={list} sort="updatedAt">{t('admin.pages.table.updatedAt')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader align="right">{t('admin.pages.table.actions')}</DataTableHeader>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {list.items.length === 0 ? (
            <DataTableRow>
              <DataTableCell colSpan={7} className="py-lg text-center text-muted">
                {t('admin.pages.empty')}
              </DataTableCell>
            </DataTableRow>
          ) : (
            list.items.map((page) => (
              <DataTableRow key={page.id}>
                <DataTableCell className="max-w-72 font-medium">
                  <span className="block truncate">{page.title}</span>
                </DataTableCell>
                <DataTableCell className="max-w-80 text-muted">
                  <code className="block truncate text-xs">{page.path}</code>
                </DataTableCell>
                <DataTableCell>
                  <span className="rounded-md border border-border px-sm py-xs text-xs capitalize text-muted">
                    {t(`admin.pages.status.${page.status}` as TranslationKey)}
                  </span>
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {page.authorDisplayName ?? page.authorEmail}
                </DataTableCell>
                <DataTableCell align="right">{page.editCount}</DataTableCell>
                <DataTableCell className="text-muted">
                  {new Date(page.updatedAt).toLocaleString()}
                </DataTableCell>
                <DataTableCell align="right">
                  <div className="flex items-center justify-end gap-xs">
                    <IconLink href={getPageHref(page.path)} label={t('admin.pages.actions.view')}>
                      <EyeIcon />
                    </IconLink>
                    <IconLink href={getEditHref(page.path)} label={t('admin.pages.actions.edit')}>
                      <EditIcon />
                    </IconLink>
                    <DeletePageButton pageId={page.id} title={page.title} />
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>

      <div className="flex flex-col items-center justify-between gap-sm sm:flex-row">
        <p className="text-sm text-muted">
          {t('admin.pages.pagination.summary', {
            total: list.totalItems,
            page: list.currentPage,
            pages: list.totalPages,
          })}
        </p>
        <Pagination currentPage={list.currentPage} totalPages={list.totalPages} />
      </div>
    </div>
  );
}
