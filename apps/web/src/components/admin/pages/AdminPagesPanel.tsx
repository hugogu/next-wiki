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
import { ArrowDownIcon, SearchIcon, XIcon } from '@/components/icons';
import { getSpaceHref, readerSpaceFromSlug } from '@/lib/path';
import { EditableTagList } from '@/components/pages/EditableTagList';
import { AdminPageStats } from './AdminPageStats';
import { DeletePageButton } from './DeletePageButton';
import { MovePageButton } from './MovePageButton';

type QueryMap = Record<string, string | undefined>;

function buildAdminPagesHref(query: QueryMap, overrides: QueryMap): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/admin/pages?${qs}` : '/admin/pages';
}

function sortAriaValue(list: AdminPageListResult, sort: AdminPageSortKey): 'ascending' | 'descending' | undefined {
  if (list.sort !== sort) return undefined;
  return list.direction === 'asc' ? 'ascending' : 'descending';
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

  return (
    <Link
      href={buildAdminPagesHref(query, { sort, direction: nextDirection, page: undefined })}
      className="inline-flex items-center gap-xs rounded-sm text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label={t('admin.pages.sortBy', { column: String(children) })}
    >
      {children}
      {active && (
        <ArrowDownIcon
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${list.direction === 'asc' ? 'rotate-180' : ''}`}
        />
      )}
    </Link>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, keyword }: { text: string; keyword?: string }) {
  const normalizedKeyword = keyword?.trim();
  if (!normalizedKeyword) return text;

  const matcher = new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'gi');
  return text.split(matcher).map((part, index) => {
    if (!part) return null;
    return part.toLocaleLowerCase() === normalizedKeyword.toLocaleLowerCase()
      ? <mark key={`${part}-${index}`} className="rounded-sm bg-primary/20 px-0.5 text-foreground">{part}</mark>
      : part;
  });
}

export function AdminPagesPanel({
  t,
  list,
  query,
  moveEnabled = false,
}: {
  t: TranslateFunction;
  list: AdminPageListResult;
  query: QueryMap;
  /** LLM Wiki mode: enables the space filter and cross-space move action. */
  moveEnabled?: boolean;
}) {
  const currentSpace =
    list.filters.space === 'generated' ? 'generated' : list.filters.space === 'raw' ? 'raw' : 'default';
  // Move only ever crosses Wiki <-> Generated; Raw content is append-only and
  // is never a move source or target (see constitution: Raw pages stay append-only).
  const targetSpace = currentSpace === 'generated' ? 'default' : 'generated';
  const targetSpaceLabel = t(targetSpace === 'generated' ? 'admin.pages.spaces.generated' : 'admin.pages.spaces.wiki');
  return (
    <div className="space-y-md">
      <div className="grid gap-md lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] lg:items-start">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.pages.title')}</h1>
          <p className="mt-xs max-w-3xl text-sm text-muted">{t('admin.pages.description')}</p>
        </div>
        <AdminPageStats />
      </div>

      {moveEnabled && (
        <form action="/admin/pages" className="flex flex-wrap items-center gap-sm">
          <span className="text-xs font-medium text-muted">{t('admin.pages.filters.space')}</span>
          {(['default', 'generated', 'raw'] as const).map((slug) => (
            <Link
              key={slug}
              href={buildAdminPagesHref({ sort: list.sort, direction: list.direction }, { space: slug === 'default' ? undefined : slug })}
              className={`rounded-md border px-sm py-xs text-sm ${currentSpace === slug ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted hover:text-foreground'}`}
            >
              {t(
                slug === 'generated'
                  ? 'admin.pages.spaces.generated'
                  : slug === 'raw'
                    ? 'admin.pages.spaces.raw'
                    : 'admin.pages.spaces.wiki',
              )}
            </Link>
          ))}
        </form>
      )}

      <form action="/admin/pages">
        <input type="hidden" name="sort" value={list.sort} />
        <input type="hidden" name="direction" value={list.direction} />
        {currentSpace !== 'default' && <input type="hidden" name="space" value={currentSpace} />}
        <div className="grid items-end gap-sm md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.7fr)_minmax(9rem,0.65fr)_minmax(9rem,0.65fr)_auto_auto]">
          <label className="space-y-xs">
            <span className="text-xs font-medium text-muted">{t('admin.pages.filters.keyword')}</span>
            <input
              name="keyword"
              defaultValue={list.filters.keyword ?? ''}
              placeholder={t('admin.pages.filters.keywordPlaceholder')}
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
          <Link
            href="/admin/pages"
            aria-label={t('admin.pages.filters.reset')}
            title={t('admin.pages.filters.reset')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <XIcon className="h-4 w-4" />
          </Link>
          <button
            type="submit"
            aria-label={t('admin.pages.filters.apply')}
            title={t('admin.pages.filters.apply')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-text hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        </div>
      </form>

      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeader aria-sort={sortAriaValue(list, 'title')}>
              <SortHeader t={t} query={query} list={list} sort="title">{t('admin.pages.table.title')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader>{t('admin.pages.table.status')}</DataTableHeader>
            <DataTableHeader aria-sort={sortAriaValue(list, 'author')}>
              <SortHeader t={t} query={query} list={list} sort="author">{t('admin.pages.table.author')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader align="right" aria-sort={sortAriaValue(list, 'edits')}>
              <SortHeader t={t} query={query} list={list} sort="edits">{t('admin.pages.table.edits')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader aria-sort={sortAriaValue(list, 'updatedAt')}>
              <SortHeader t={t} query={query} list={list} sort="updatedAt">{t('admin.pages.table.updatedAt')}</SortHeader>
            </DataTableHeader>
            <DataTableHeader align="right">{t('admin.pages.table.actions')}</DataTableHeader>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {list.items.length === 0 ? (
            <DataTableRow>
              <DataTableCell colSpan={6} className="py-lg text-center text-muted">
                {t('admin.pages.empty')}
              </DataTableCell>
            </DataTableRow>
          ) : (
            list.items.map((page) => (
              <DataTableRow key={page.id}>
                <DataTableCell className="max-w-sm font-medium">
                  <Link
                    href={getSpaceHref(readerSpaceFromSlug(page.spaceSlug), page.path)}
                    className="block truncate rounded-sm text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <HighlightedText text={page.title} keyword={list.filters.keyword} />
                  </Link>
                  <code className="mt-0.5 block truncate text-xs font-normal text-muted"><HighlightedText text={page.path} keyword={list.filters.keyword} /></code>
                  <div className="mt-xs">
                    <EditableTagList tags={page.tags} pageId={page.id} canEdit ariaLabel={t('page.metadata.tags')} />
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <span className="inline-flex items-center gap-xs rounded-md border border-border px-sm py-xs text-xs capitalize text-muted">
                    {t(`admin.pages.status.${page.status}` as TranslationKey)}
                    {page.kind === 'link' && (
                      <span className="text-muted/70">({t('admin.pages.status.linked')})</span>
                    )}
                  </span>
                </DataTableCell>
                <DataTableCell className="text-muted">
                  <HighlightedText text={page.authorDisplayName ?? page.authorEmail} keyword={list.filters.keyword} />
                </DataTableCell>
                <DataTableCell align="right">{page.editCount}</DataTableCell>
                <DataTableCell className="text-muted">
                  {new Date(page.updatedAt).toLocaleString()}
                </DataTableCell>
                <DataTableCell align="right">
                  <div className="flex items-center justify-end gap-xs">
                    {moveEnabled && page.kind === 'native' && currentSpace !== 'raw' && (
                      <MovePageButton
                        pageId={page.id}
                        title={page.title}
                        targetSpace={targetSpace}
                        targetSpaceLabel={targetSpaceLabel}
                      />
                    )}
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
