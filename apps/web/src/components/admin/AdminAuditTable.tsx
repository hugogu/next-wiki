'use client';

import { useState, useCallback, useId } from 'react';
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
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@/components/icons';

const METHOD_OPTIONS = ['', 'GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

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
  const pathId = useId();
  const startTimeId = useId();
  const endTimeId = useId();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(initialData.page);
  const [filters, setFilters] = useState({
    userId: '',
    status: '',
    method: '',
    path: '',
    startTime: '',
    endTime: '',
  });

  const buildParams = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', String(data.pageSize));
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.status) params.set('status', filters.status);
      if (filters.method) params.set('method', filters.method);
      if (filters.path) params.set('path', filters.path);
      if (filters.startTime) params.set('startTime', new Date(filters.startTime).toISOString());
      if (filters.endTime) params.set('endTime', new Date(filters.endTime).toISOString());
      return params;
    },
    [filters, data.pageSize],
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const result = await apiGet<AuditListResponse>(`/api/audit/all?${buildParams(targetPage).toString()}`);
        setData(result);
        setPage(targetPage);
      } finally {
        setLoading(false);
      }
    },
    [buildParams],
  );

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => fetchPage(1);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_9rem_8rem_minmax(0,1.25fr)_11rem_11rem_auto]">
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
              onChange={(e) => updateFilter('status', e.target.value)}
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
              onChange={(e) => updateFilter('method', e.target.value)}
            >
              {METHOD_OPTIONS.map((method) => (
                <option key={method || 'all'} value={method}>
                  {method || t('userCenter.audit.all')}
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

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => fetchPage(page - 1)}
              disabled={page <= 1 || loading}
            >
              <ChevronLeftIcon />
              <span className="ml-2">{t('userCenter.audit.prev')}</span>
            </Button>
            <span className="text-sm text-muted">
              {t('userCenter.audit.page')} {page} {t('userCenter.audit.of')} {totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => fetchPage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              <span className="mr-2">{t('userCenter.audit.next')}</span>
              <ChevronRightIcon />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
