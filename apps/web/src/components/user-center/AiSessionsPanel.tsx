'use client';

import { useCallback, useState } from 'react';
import type { AiActionEvent, AiActionStatus, AiSessionListResponse, AiSessionSummary, RawConversationPointer } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';
import { apiGet, apiDelete } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, LinkIcon, SearchIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import { useChatStore } from '@/components/chat/chat-store';
import { ConversationSessionView } from '@/components/chat/ConversationSessionView';
import { reconstructSessionFromEvents, type ReconstructedSession } from '@/components/chat/reconstruct-session';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<AiActionStatus, TranslationKey> = {
  queued: 'admin.ai.actionStatus.queued',
  running: 'admin.ai.actionStatus.running',
  completed: 'admin.ai.actionStatus.completed',
  failed: 'admin.ai.actionStatus.failed',
  cancelled: 'admin.ai.actionStatus.cancelled',
  expired: 'admin.ai.actionStatus.expired',
};
const STATUSES = Object.keys(STATUS_LABELS) as AiActionStatus[];

/**
 * 023: a captured session's canonical content lives in its Raw Conversation
 * page, which outlives the event log's retention window. Preferring
 * `rawConversation.conversation` here means "view" and "continue" always see
 * the durable record instead of silently resuming from an empty
 * reconstruction once events have expired. Legacy (never-captured) sessions
 * are unaffected — they keep reconstructing from the event log exactly as
 * before.
 */
async function fetchDetail(id: string): Promise<ReconstructedSession> {
  const { events, rawConversation } = await apiGet<{
    events: AiActionEvent[];
    rawConversation: RawConversationPointer | null;
  }>(`/api/ai/sessions/${id}`);
  const captured = rawConversation?.conversation;
  if (captured) {
    return {
      question: captured.question,
      answer: captured.answer,
      thinking: captured.thinking,
      citations: captured.citations,
      insufficient: captured.insufficient,
      errorMessage: captured.errorMessage,
    };
  }
  return reconstructSessionFromEvents(events);
}

export function AiSessionsPanel({ initial }: { initial: AiSessionListResponse }) {
  const { t, locale } = useTranslation();
  const loadSession = useChatStore((state) => state.loadSession);

  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const [viewing, setViewing] = useState<AiSessionSummary | null>(null);
  const [detail, setDetail] = useState<ReconstructedSession | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [continuingId, setContinuingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiSessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async (targetPage: number, searchTerm: string, statusTerm: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusTerm) params.set('status', statusTerm);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(targetPage * PAGE_SIZE));
      const result = await apiGet<AiSessionListResponse>(`/api/ai/sessions?${params.toString()}`);
      setItems(result.items);
      setTotal(result.total);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }, []);

  const applySearch = () => void load(0, search, status);
  const applyStatus = (value: string) => {
    setStatus(value);
    void load(0, search, value);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openView = async (session: AiSessionSummary) => {
    setViewing(session);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchDetail(session.id));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleContinue = async (session: AiSessionSummary) => {
    setContinuingId(session.id);
    try {
      const reconstructed = await fetchDetail(session.id);
      loadSession({
        mode: session.questionMode ?? 'retrieval',
        question: reconstructed.question,
        answer: reconstructed.answer,
        citations: reconstructed.citations,
        insufficient: reconstructed.insufficient,
      });
      setViewing(null);
    } finally {
      setContinuingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await apiDelete(`/api/ai/sessions/${deleteTarget.id}`);
      const remainingOnPage = items.length - 1;
      const nextPage = remainingOnPage === 0 && page > 0 ? page - 1 : page;
      await load(nextPage, search, status);
      setDeleteTarget(null);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('userCenter.aiSessions.deleteFailed');
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  return (
    <div className="space-y-md">
      <div>
        <h2 className="font-display text-2xl font-semibold">{t('userCenter.aiSessions.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('userCenter.aiSessions.description')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-sm">
        <div className="flex-1 min-w-48">
          <label htmlFor="ai-sessions-search" className="mb-xs block text-sm font-medium">
            {t('userCenter.aiSessions.searchLabel')}
          </label>
          <input
            id="ai-sessions-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySearch();
            }}
            placeholder={t('userCenter.aiSessions.searchPlaceholder')}
            className="w-full rounded-md border border-border bg-background px-sm py-xs text-sm"
          />
        </div>
        <div>
          <label htmlFor="ai-sessions-status" className="mb-xs block text-sm font-medium">
            {t('userCenter.aiSessions.filterByStatus')}
          </label>
          <Select id="ai-sessions-status" value={status} onChange={(event) => applyStatus(event.target.value)} containerClassName="w-40">
            <option value="">{t('userCenter.aiSessions.allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>{t(STATUS_LABELS[value])}</option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          onClick={applySearch}
          disabled={loading}
          size="icon"
          aria-label={t('common.actions.search')}
          title={t('common.actions.search')}
        >
          <SearchIcon className="h-5 w-5" />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted">{t('userCenter.aiSessions.empty')}</p>
      ) : (
        <>
          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeader>{t('userCenter.aiSessions.question')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.aiSessions.status')}</DataTableHeader>
                <DataTableHeader>{t('userCenter.aiSessions.date')}</DataTableHeader>
                <DataTableHeader align="right">{t('userCenter.aiSessions.actions')}</DataTableHeader>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {items.map((session) => (
                <DataTableRow key={session.id}>
                  <DataTableCell className="max-w-sm truncate">
                    {session.questionExcerpt ?? <span className="text-muted">{t('userCenter.aiSessions.contentExpired')}</span>}
                  </DataTableCell>
                  <DataTableCell>{t(STATUS_LABELS[session.status])}</DataTableCell>
                  <DataTableCell className="text-muted">{formatDate(session.queuedAt)}</DataTableCell>
                  <DataTableCell align="right">
                    <div className="flex items-center justify-end gap-sm">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void openView(session)}
                        title={t('userCenter.aiSessions.view')}
                        aria-label={t('userCenter.aiSessions.view')}
                      >
                        <EyeIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleContinue(session)}
                        disabled={continuingId === session.id}
                        title={t('userCenter.aiSessions.continue')}
                        aria-label={t('userCenter.aiSessions.continue')}
                      >
                        <SparklesIcon />
                      </Button>
                      {session.rawConversation && (
                        <a
                          href={session.rawConversation.url}
                          title={t('userCenter.aiSessions.openRawPage')}
                          aria-label={t('userCenter.aiSessions.openRawPage')}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent font-medium text-muted transition-colors hover:bg-surface hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          <LinkIcon />
                        </a>
                      )}
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setDeleteTarget(session)}
                        disabled={Boolean(session.rawConversation)}
                        title={session.rawConversation ? t('userCenter.aiSessions.captureImmutable') : t('userCenter.aiSessions.delete')}
                        aria-label={session.rawConversation ? t('userCenter.aiSessions.captureImmutable') : t('userCenter.aiSessions.delete')}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>

          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" disabled={page <= 0 || loading} onClick={() => void load(page - 1, search, status)}>
              <ChevronLeftIcon />
              <span className="ml-2">{t('userCenter.audit.prev')}</span>
            </Button>
            <span className="text-sm text-muted">
              {t('userCenter.audit.page')} {page + 1} {t('userCenter.audit.of')} {totalPages}
            </span>
            <Button type="button" variant="ghost" disabled={page + 1 >= totalPages || loading} onClick={() => void load(page + 1, search, status)}>
              <span className="mr-2">{t('userCenter.audit.next')}</span>
              <ChevronRightIcon />
            </Button>
          </div>
        </>
      )}

      {viewing && (
        <ModalDialog
          title={t('userCenter.aiSessions.detailTitle')}
          description={formatDate(viewing.queuedAt)}
          onClose={() => setViewing(null)}
        >
          {detailLoading || !detail ? (
            <p className="text-sm text-muted">{t('userCenter.aiSessions.loading')}</p>
          ) : (
            <div className="space-y-sm">
              <ConversationSessionView
                conversation={{
                  status: viewing.status,
                  question: detail.question,
                  answer: detail.answer,
                  thinking: detail.thinking,
                  citations: detail.citations,
                  insufficient: detail.insufficient,
                  errorMessage: detail.errorMessage,
                }}
                channel={viewing.rawConversation?.channel}
              />
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleContinue(viewing)} disabled={continuingId === viewing.id}>
                  <SparklesIcon />
                  <span className="ml-2">{t('userCenter.aiSessions.continue')}</span>
                </Button>
              </div>
            </div>
          )}
        </ModalDialog>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('userCenter.aiSessions.deleteTitle')}
          message={t('userCenter.aiSessions.deleteMessage')}
          confirmLabel={t('userCenter.aiSessions.delete')}
          confirmVariant="danger"
          pending={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError('');
          }}
        />
      )}
    </div>
  );
}
