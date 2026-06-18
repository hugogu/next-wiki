'use client';

import { useState, useCallback, useId } from 'react';
import { useTranslation } from '@/i18n/client';
import type { AuditEntry, AuditListResponse } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

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
  const keyIdId = useId();
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
    keyId: '',
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
      if (filters.keyId) params.set('keyId', filters.keyId);
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div>
          <label htmlFor={userIdId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.filterByUser')}</label>
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
          <label htmlFor={keyIdId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.filterByKey')}</label>
          <input
            id={keyIdId}
            type="text"
            value={filters.keyId}
            onChange={(e) => updateFilter('keyId', e.target.value)}
            placeholder={t('admin.apiAudit.allKeys')}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={statusId} className="block text-sm font-medium mb-xs">{t('userCenter.audit.filterByStatus')}</label>
          <select
            id={statusId}
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          >
            <option value="">{t('userCenter.audit.all')}</option>
            <option value="success">{t('userCenter.audit.success')}</option>
            <option value="error">{t('userCenter.audit.error')}</option>
          </select>
        </div>
        <div>
          <label htmlFor={methodId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.method')}</label>
          <input
            id={methodId}
            type="text"
            value={filters.method}
            onChange={(e) => updateFilter('method', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={pathId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.path')}</label>
          <input
            id={pathId}
            type="text"
            value={filters.path}
            onChange={(e) => updateFilter('path', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={startTimeId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.from')}</label>
          <input
            id={startTimeId}
            type="datetime-local"
            value={filters.startTime}
            onChange={(e) => updateFilter('startTime', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div>
          <label htmlFor={endTimeId} className="block text-sm font-medium mb-xs">{t('admin.apiAudit.to')}</label>
          <input
            id={endTimeId}
            type="datetime-local"
            value={filters.endTime}
            onChange={(e) => updateFilter('endTime', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={handleApply} disabled={loading}>
            {t('userCenter.profile.saveButton')}
          </Button>
        </div>
      </div>

      {data.entries.length === 0 ? (
        <p className="text-muted">{t('admin.apiAudit.noEntries')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-left">
                <tr>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.user')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.keyName')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.method')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.path')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.status')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.duration')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.authStatus')}</th>
                  <th className="px-md py-sm font-medium">{t('admin.apiAudit.timestamp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.entries.map((entry: AuditEntry) => (
                  <tr key={entry.id}>
                    <td className="px-md py-sm">{entry.userEmail ?? entry.userId ?? '—'}</td>
                    <td className="px-md py-sm">{entry.keyName ?? '—'}</td>
                    <td className="px-md py-sm font-mono">{entry.method}</td>
                    <td className="px-md py-sm font-mono text-xs truncate max-w-xs">{entry.path}</td>
                    <td className={`px-md py-sm font-medium ${statusColor(entry.statusCode)}`}>{entry.statusCode}</td>
                    <td className="px-md py-sm">{entry.durationMs}ms</td>
                    <td className="px-md py-sm">{entry.authStatus}</td>
                    <td className="px-md py-sm text-muted">{new Date(entry.createdAt).toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
