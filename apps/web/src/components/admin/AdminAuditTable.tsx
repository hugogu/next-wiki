'use client';

import { useState, useCallback, useEffect, useId, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/i18n/client';
import type { AuditEntry, AuditListResponse } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Pagination, buildPageHref } from '@/components/ui/Pagination';
import { SearchIcon } from '@/components/icons';

/** Parse the URL `page` param; non-numeric/zero/negative fall back to page 1. */
function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function formatDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function parseDateTimeLocal(value: string): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  } catch {
    return '';
  }
}

const METHOD_OPTIONS = ['', 'GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const ENTRY_TYPE_OPTIONS: { value: '' | 'page' | 'api'; key: 'admin.apiAudit.all' | 'admin.apiAudit.page' | 'admin.apiAudit.api' }[] = [
  { value: '', key: 'admin.apiAudit.all' },
  { value: 'page', key: 'admin.apiAudit.page' },
  { value: 'api', key: 'admin.apiAudit.api' },
];

function buildAuditParams(
  source: { userId: string; status: string; method: string; entryType: string; path: string; startTime: string; endTime: string },
  targetPage: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(targetPage));
  params.set('pageSize', String(pageSize));
  if (source.userId) params.set('userId', source.userId);
  if (source.status) params.set('status', source.status);
  if (source.method) params.set('method', source.method);
  if (source.entryType) params.set('entryType', source.entryType);
  if (source.path) params.set('path', source.path);
  const startTime = parseDateTimeLocal(source.startTime);
  const endTime = parseDateTimeLocal(source.endTime);
  if (startTime) params.set('startTime', startTime);
  if (endTime) params.set('endTime', endTime);
  return params;
}

const STATUS_COLORS: Record<number, string> = {
  2: 'text-success',
  3: 'text-info',
  4: 'text-warning',
  5: 'text-danger',
};

function statusColor(code: number) {
  return STATUS_COLORS[Math.floor(code / 100)] ?? 'text-muted';
}

interface AdminAuditTableProps {
  initialData: AuditListResponse;
}

export function AdminAuditTable({ initialData }: AdminAuditTableProps) {
  const { t, locale } = useTranslation();
  const userIdId = useId();
  const statusId = useId();
  const methodId = useId();
  const entryTypeId = useId();
  const pathId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  // The active page lives in the URL (?page=N) so refresh, deep link, and
  // back/forward all restore it (FR-021).
  const page = parsePage(searchParams.get('page'));
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(() => ({
    userId: searchParams.get('userId') ?? '',
    status: searchParams.get('status') ?? '',
    method: searchParams.get('method') ?? '',
    entryType: searchParams.get('entryType') ?? '',
    path: searchParams.get('path') ?? '',
    startTime: formatDateTimeLocal(searchParams.get('startTime')),
    endTime: formatDateTimeLocal(searchParams.get('endTime')),
  }));

  const buildParams = useCallback(
    (targetPage: number) => buildAuditParams(filters, targetPage, data.pageSize),
    [filters, data.pageSize],
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const currentFilters = {
          userId: searchParams.get('userId') ?? '',
          status: searchParams.get('status') ?? '',
          method: searchParams.get('method') ?? '',
          entryType: searchParams.get('entryType') ?? '',
          path: searchParams.get('path') ?? '',
          startTime: formatDateTimeLocal(searchParams.get('startTime')),
          endTime: formatDateTimeLocal(searchParams.get('endTime')),
        };
        const params = buildAuditParams(currentFilters, targetPage, data.pageSize);
        const result = await apiGet<AuditListResponse>(`/api/audit/all?${params.toString()}`);
        setData(result);
      } finally {
        setLoading(false);
      }
    },
    [searchParams, data.pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  // Clamp an out-of-range deep link (?page=99999) down to the last real page
  // (FR-023); `data.total` is accurate regardless of the fetched page.
  useEffect(() => {
    if (page > totalPages) {
      router.replace(buildPageHref(pathname, new URLSearchParams(searchParams), 'page', totalPages));
    }
  }, [page, totalPages, router, pathname, searchParams]);

  // Fetch when the URL changes (page or filters). On first render, initialData
  // already matches the server's landing URL, so skip the extra fetch.
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });
  const mounted = useRef(false);
  useEffect(() => {
    const firstRender = !mounted.current;
    mounted.current = true;
    if (firstRender) return;
    void fetchRef.current(page);
  }, [searchParamsKey, searchParams, page]);

  // Sync filter inputs with URL search params when the user navigates (back,
  // forward, or deep link).
  useEffect(() => {
    if (!mounted.current) return;
    setFilters({
      userId: searchParams.get('userId') ?? '',
      status: searchParams.get('status') ?? '',
      method: searchParams.get('method') ?? '',
      entryType: searchParams.get('entryType') ?? '',
      path: searchParams.get('path') ?? '',
      startTime: formatDateTimeLocal(searchParams.get('startTime')),
      endTime: formatDateTimeLocal(searchParams.get('endTime')),
    });
  }, [searchParamsKey, searchParams]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Dropdown filters apply immediately (page reset to 1).
  const applyFilter = (key: keyof typeof filters, value: string) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    router.push(`${pathname}?${buildAuditParams(nextFilters, 1, data.pageSize).toString()}`);
  };

  // Applying filters writes them to the URL (page reset to 1) and triggers the
  // fetch effect, making filters shareable via the address bar.
  const handleApply = () => {
    router.push(`${pathname}?${buildParams(1).toString()}`);
  };

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_9rem_8rem_8rem_minmax(0,1.25fr)_11rem_11rem_auto]">
        <div>
          <label htmlFor={userIdId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.filterByUser')}</label>
          <input
            id={userIdId}
            type="text"
            value={filters.userId}
            onChange={(e) => updateFilter('userId', e.target.value)}
            placeholder={t('admin.apiAudit.allUsers')}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={statusId} className="mb-xs block text-sm font-medium">{t('userCenter.audit.filterByStatus')}</label>
          <Select
              id={statusId}
              value={filters.status}
              onChange={(e) => applyFilter('status', e.target.value)}
            >
              <option value="">{t('userCenter.audit.all')}</option>
              <option value="success">{t('userCenter.audit.success')}</option>
              <option value="error">{t('userCenter.audit.error')}</option>
          </Select>
        </div>
        <div>
          <label htmlFor={methodId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.method')}</label>
          <Select
              id={methodId}
              value={filters.method}
              onChange={(e) => applyFilter('method', e.target.value)}
            >
              {METHOD_OPTIONS.map((method) => (
                <option key={method || 'all'} value={method}>
                  {method || t('userCenter.audit.all')}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <label htmlFor={entryTypeId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.entryType')}</label>
          <Select
              id={entryTypeId}
              value={filters.entryType}
              onChange={(e) => applyFilter('entryType', e.target.value)}
            >
              {ENTRY_TYPE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <label htmlFor={pathId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.path')}</label>
          <input
            id={pathId}
            type="text"
            value={filters.path}
            onChange={(e) => updateFilter('path', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={startTimeId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.from')}</label>
          <input
            id={startTimeId}
            type="datetime-local"
            value={filters.startTime}
            onChange={(e) => updateFilter('startTime', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={endTimeId} className="mb-xs block text-sm font-medium">{t('admin.apiAudit.to')}</label>
          <input
            id={endTimeId}
            type="datetime-local"
            value={filters.endTime}
            onChange={(e) => updateFilter('endTime', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={handleApply}
            disabled={loading}
            size="icon"
            aria-label={t('common.actions.search')}
            title={t('common.actions.search')}
          >
            <SearchIcon className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <p className="text-muted">{t('admin.apiAudit.noEntries')}</p>
      ) : (
        <>
          <DataTable>
            <DataTableHead>
                <tr>
                  <DataTableHeader>{t('admin.apiAudit.user')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.keyName')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.method')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.path')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.status')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.duration')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.authStatus')}</DataTableHeader>
                  <DataTableHeader>{t('admin.apiAudit.timestamp')}</DataTableHeader>
                </tr>
            </DataTableHead>
            <DataTableBody>
                {data.entries.map((entry: AuditEntry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell>{entry.userEmail ?? entry.userId ?? '—'}</DataTableCell>
                    <DataTableCell>{entry.keyName ?? '—'}</DataTableCell>
                    <DataTableCell className="font-mono">{entry.method}</DataTableCell>
                    <DataTableCell className="max-w-xs truncate font-mono text-xs">{entry.path}</DataTableCell>
                    <DataTableCell className={`font-medium ${statusColor(entry.statusCode)}`}>{entry.statusCode}</DataTableCell>
                    <DataTableCell>{entry.durationMs}ms</DataTableCell>
                    <DataTableCell>{entry.authStatus}</DataTableCell>
                    <DataTableCell className="text-muted">{new Date(entry.createdAt).toLocaleString(locale)}</DataTableCell>
                  </DataTableRow>
                ))}
            </DataTableBody>
          </DataTable>

          <Pagination currentPage={Math.min(page, totalPages)} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
