'use client';

import { useState, useCallback } from 'react';
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

const STATUS_COLORS: Record<number, string> = {
  2: 'text-success',
  3: 'text-info',
  4: 'text-warning',
  5: 'text-danger',
};

function statusColor(code: number) {
  return STATUS_COLORS[Math.floor(code / 100)] ?? 'text-muted';
}

interface AuditLogTableProps {
  initialData: AuditListResponse;
  fetchUrl: string;
  keys?: { id: string; name: string }[];
  entryType?: string;
}

export function AuditLogTable({ initialData, fetchUrl, keys, entryType }: AuditLogTableProps) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(initialData.page);

  const buildParams = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', String(data.pageSize));
      if (keyId) params.set('keyId', keyId);
      if (status) params.set('status', status);
      if (entryType) params.set('entryType', entryType);
      return params;
    },
    [keyId, status, entryType, data.pageSize],
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const result = await apiGet<AuditListResponse>(`${fetchUrl}?${buildParams(targetPage).toString()}`);
        setData(result);
        setPage(targetPage);
      } finally {
        setLoading(false);
      }
    },
    [fetchUrl, buildParams],
  );

  const handleApply = () => fetchPage(1);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-md">
      <div className="flex flex-wrap items-end gap-sm">
        <div>
          <label htmlFor="audit-key" className="mb-xs block text-sm font-medium">{t('userCenter.audit.filterByKey')}</label>
          <Select
              id="audit-key"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              containerClassName="w-48"
            >
              <option value="">{t('userCenter.audit.allKeys')}</option>
              {keys?.map((key) => (
                <option key={key.id} value={key.id}>{key.name}</option>
              ))}
          </Select>
        </div>

        <div>
          <label htmlFor="audit-status" className="mb-xs block text-sm font-medium">{t('userCenter.audit.filterByStatus')}</label>
          <Select
              id="audit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              containerClassName="w-40"
            >
              <option value="">{t('userCenter.audit.all')}</option>
              <option value="success">{t('userCenter.audit.success')}</option>
              <option value="error">{t('userCenter.audit.error')}</option>
          </Select>
        </div>

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

      {data.entries.length === 0 ? (
        <p className="text-muted">{t('userCenter.audit.noEntries')}</p>
      ) : (
        <>
          <DataTable>
            <DataTableHead>
                <tr>
                  <DataTableHeader>{t('userCenter.audit.method')}</DataTableHeader>
                  <DataTableHeader>{t('userCenter.audit.path')}</DataTableHeader>
                  <DataTableHeader>{t('userCenter.audit.status')}</DataTableHeader>
                  <DataTableHeader>{t('userCenter.audit.duration')}</DataTableHeader>
                  <DataTableHeader>{t('userCenter.audit.keyName')}</DataTableHeader>
                  <DataTableHeader>{t('userCenter.audit.timestamp')}</DataTableHeader>
                </tr>
            </DataTableHead>
            <DataTableBody>
                {data.entries.map((entry: AuditEntry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell className="font-mono">{entry.method}</DataTableCell>
                    <DataTableCell className="max-w-xs truncate font-mono text-xs">{entry.path}</DataTableCell>
                    <DataTableCell className={`font-medium ${statusColor(entry.statusCode)}`}>{entry.statusCode}</DataTableCell>
                    <DataTableCell>{entry.durationMs}ms</DataTableCell>
                    <DataTableCell>{entry.keyName ?? '—'}</DataTableCell>
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
