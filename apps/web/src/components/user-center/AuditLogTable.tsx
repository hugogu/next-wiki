'use client';

import { useState, useCallback } from 'react';
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

interface AuditLogTableProps {
  initialData: AuditListResponse;
  fetchUrl: string;
  keys?: { id: string; name: string }[];
}

export function AuditLogTable({ initialData, fetchUrl, keys }: AuditLogTableProps) {
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
      return params;
    },
    [keyId, status, data.pageSize],
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
      <div className="flex flex-wrap items-end gap-md">
        <div>
          <label htmlFor="audit-key" className="block text-sm font-medium mb-xs">{t('userCenter.audit.filterByKey')}</label>
          <select
            id="audit-key"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            className="w-48 rounded-md border border-border bg-surface px-md py-sm text-sm"
          >
            <option value="">{t('userCenter.audit.allKeys')}</option>
            {keys?.map((key) => (
              <option key={key.id} value={key.id}>{key.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-status" className="block text-sm font-medium mb-xs">{t('userCenter.audit.filterByStatus')}</label>
          <select
            id="audit-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-40 rounded-md border border-border bg-surface px-md py-sm text-sm"
          >
            <option value="">{t('userCenter.audit.all')}</option>
            <option value="success">{t('userCenter.audit.success')}</option>
            <option value="error">{t('userCenter.audit.error')}</option>
          </select>
        </div>

        <Button type="button" onClick={handleApply} disabled={loading}>
          {t('userCenter.profile.saveButton')}
        </Button>
      </div>

      {data.entries.length === 0 ? (
        <p className="text-muted">{t('userCenter.audit.noEntries')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-left">
                <tr>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.method')}</th>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.path')}</th>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.status')}</th>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.duration')}</th>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.keyName')}</th>
                  <th className="px-md py-sm font-medium">{t('userCenter.audit.timestamp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.entries.map((entry: AuditEntry) => (
                  <tr key={entry.id}>
                    <td className="px-md py-sm font-mono">{entry.method}</td>
                    <td className="px-md py-sm font-mono text-xs truncate max-w-xs">{entry.path}</td>
                    <td className={`px-md py-sm font-medium ${statusColor(entry.statusCode)}`}>{entry.statusCode}</td>
                    <td className="px-md py-sm">{entry.durationMs}ms</td>
                    <td className="px-md py-sm">{entry.keyName ?? '—'}</td>
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
