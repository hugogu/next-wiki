'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  RequestLogListResponse,
  RequestLogSettingsView,
  RequestLogLevel,
  UpdateRequestLogSettings,
} from '@next-wiki/shared';
import { apiGet, apiPatch, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';

type Filters = { sourceType: string; providerKey: string; operation: string; outcome: string };

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildParams(filters: Filters, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

function outcomeKey(
  outcome: string,
): 'success' | 'httpError' | 'transportError' | 'timeout' | 'cancelled' | 'invalidResponse' {
  return (
    (
      {
        success: 'success',
        http_error: 'httpError',
        transport_error: 'transportError',
        timeout: 'timeout',
        cancelled: 'cancelled',
        invalid_response: 'invalidResponse',
      } as const
    )[outcome] ?? 'invalidResponse'
  );
}

export function RequestLogPanel({
  initialSettings,
  initialData,
}: {
  initialSettings: RequestLogSettingsView;
  initialData: RequestLogListResponse;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const page = parsePage(searchParams.get('page'));
  const enabledId = useId();
  const levelId = useId();
  const retentionId = useId();
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState({
    enabled: initialSettings.enabled,
    level: initialSettings.level,
    retentionHours: String(initialSettings.retentionHours),
  });
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [showAllConfirm, setShowAllConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    sourceType: searchParams.get('sourceType') ?? '',
    providerKey: searchParams.get('providerKey') ?? '',
    operation: searchParams.get('operation') ?? '',
    outcome: searchParams.get('outcome') ?? '',
  }));

  const fetchPage = useCallback(
    async (nextPage: number) => {
      const currentFilters: Filters = {
        sourceType: searchParams.get('sourceType') ?? '',
        providerKey: searchParams.get('providerKey') ?? '',
        operation: searchParams.get('operation') ?? '',
        outcome: searchParams.get('outcome') ?? '',
      };
      const result = await apiGet<RequestLogListResponse>(
        `/api/request-log?${buildParams(currentFilters, nextPage, data.pageSize)}`,
      );
      setData(result);
    },
    [data.pageSize, searchParams],
  );
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void fetchPage(page).catch(() => setError(t('admin.requestLog.loadFailed')));
  }, [fetchPage, page, searchKey, t]);
  const applyFilters = () => router.push(`${pathname}?${buildParams(filters, 1, data.pageSize)}`);
  const persistSettings = async (confirmed: boolean) => {
    const retentionHours = Number(form.retentionHours);
    if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 168) return;
    setSaving(true);
    setError(null);
    try {
      const input: UpdateRequestLogSettings = {
        enabled: form.enabled,
        level: form.level,
        retentionHours,
        ...(confirmed ? { confirmSensitiveCapture: true } : {}),
      };
      const next = await apiPatch<UpdateRequestLogSettings, RequestLogSettingsView>(
        '/api/request-log/settings',
        input,
      );
      setSettings(next);
      setForm({
        enabled: next.enabled,
        level: next.level,
        retentionHours: String(next.retentionHours),
      });
      setShowAllConfirm(false);
    } catch (cause) {
      setError((cause as ApiError).message ?? t('admin.requestLog.loadFailed'));
    } finally {
      setSaving(false);
    }
  };
  const save = () => {
    if (form.enabled && form.level === 'all') setShowAllConfirm(true);
    else void persistSettings(false);
  };
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-xl">
      <section className="rounded-lg border border-border bg-surface p-lg">
        <h1 className="font-display text-2xl font-semibold">{t('admin.requestLog.title')}</h1>
        <p className="mt-xs text-sm text-muted">{t('admin.requestLog.description')}</p>
        <div className="mt-lg grid gap-md md:grid-cols-3">
          <label className="flex items-center gap-sm text-sm font-medium" htmlFor={enabledId}>
            <input
              id={enabledId}
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((value) => ({ ...value, enabled: e.target.checked }))}
            />
            {t('admin.requestLog.enabled')}
          </label>
          <label className="text-sm font-medium" htmlFor={levelId}>
            {t('admin.requestLog.level')}
            <Select
              id={levelId}
              className="mt-xs w-full"
              value={form.level}
              onChange={(e) =>
                setForm((value) => ({ ...value, level: e.target.value as RequestLogLevel }))
              }
            >
              <option value="status">{t('admin.requestLog.statusLevel')}</option>
              <option value="header">{t('admin.requestLog.headerLevel')}</option>
              <option value="all">{t('admin.requestLog.allLevel')}</option>
            </Select>
          </label>
          <label className="text-sm font-medium" htmlFor={retentionId}>
            {t('admin.requestLog.retention')}
            <input
              id={retentionId}
              type="number"
              min="1"
              max="168"
              className="mt-xs w-full rounded-md border border-border bg-surface px-md py-sm"
              value={form.retentionHours}
              onChange={(e) => setForm((value) => ({ ...value, retentionHours: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-md flex items-center gap-md">
          <Button onClick={save} disabled={saving}>
            {saving ? t('admin.requestLog.saving') : t('admin.requestLog.save')}
          </Button>
          {settings.updatedAt && (
            <span className="text-xs text-muted">
              {new Date(settings.updatedAt).toLocaleString(locale)}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-sm text-sm text-danger">
            {error}
          </p>
        )}
      </section>
      {!settings.enabled && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-md text-sm">
          {t('admin.requestLog.captureDisabled')}
        </p>
      )}
      <section className="space-y-md">
        <h2 className="font-display text-xl font-semibold">{t('admin.requestLog.filters')}</h2>
        <div className="grid gap-sm md:grid-cols-5">
          {(['sourceType', 'providerKey', 'operation'] as const).map((key) => (
            <input
              key={key}
              value={filters[key]}
              onChange={(e) => setFilters((value) => ({ ...value, [key]: e.target.value }))}
              placeholder={t(
                `admin.requestLog.${key === 'sourceType' ? 'source' : key === 'providerKey' ? 'provider' : 'operation'}`,
              )}
              className="rounded-md border border-border bg-surface px-md py-sm text-sm"
            />
          ))}
          <Select
            value={filters.outcome}
            onChange={(e) => setFilters((value) => ({ ...value, outcome: e.target.value }))}
          >
            <option value="">{t('admin.requestLog.all')}</option>
            {[
              'success',
              'http_error',
              'transport_error',
              'timeout',
              'cancelled',
              'invalid_response',
            ].map((outcome) => (
              <option key={outcome} value={outcome}>
                {t(`admin.requestLog.${outcomeKey(outcome)}`)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={applyFilters}>
            {t('admin.requestLog.apply')}
          </Button>
        </div>
        {data.entries.length === 0 ? (
          <p className="text-muted">{t('admin.requestLog.noEntries')}</p>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeader>{t('admin.requestLog.startedAt')}</DataTableHeader>
                  <DataTableHeader>{t('admin.requestLog.source')}</DataTableHeader>
                  <DataTableHeader>{t('admin.requestLog.operation')}</DataTableHeader>
                  <DataTableHeader>{t('admin.requestLog.outcome')}</DataTableHeader>
                  <DataTableHeader>{t('admin.requestLog.status')}</DataTableHeader>
                  <DataTableHeader>{t('admin.requestLog.duration')}</DataTableHeader>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {data.entries.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell className="whitespace-nowrap text-muted">
                      {new Date(entry.startedAt).toLocaleString(locale)}
                    </DataTableCell>
                    <DataTableCell>{entry.providerKey ?? entry.sourceType}</DataTableCell>
                    <DataTableCell>
                      <Link
                        href={`/admin/request-log/${entry.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {entry.operation}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>
                      {t(`admin.requestLog.${outcomeKey(entry.outcome)}`)}
                    </DataTableCell>
                    <DataTableCell>{entry.statusCode ?? '—'}</DataTableCell>
                    <DataTableCell>
                      {entry.durationMs === null ? '—' : `${entry.durationMs}ms`}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            <Pagination currentPage={Math.min(page, totalPages)} totalPages={totalPages} />
          </>
        )}
      </section>
      {showAllConfirm && (
        <ConfirmDialog
          title={t('admin.requestLog.allWarningTitle')}
          message={t('admin.requestLog.allWarning')}
          confirmLabel={t('common.actions.confirm')}
          pending={saving}
          error={error ?? undefined}
          onConfirm={() => void persistSettings(true)}
          onCancel={() => setShowAllConfirm(false)}
        />
      )}
    </div>
  );
}
