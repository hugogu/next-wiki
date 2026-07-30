'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  AiActionEvent,
  AiToolProposalEventPayload,
  ScheduledAiJobRunView,
} from '@next-wiki/shared';
import { apiGet, apiPost, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChatAnswer } from '@/components/chat/ChatAnswer';
import { ChatCitations } from '@/components/chat/ChatCitations';
import { ChatRetrieval } from '@/components/chat/ChatRetrieval';
import { ChatThinking } from '@/components/chat/ChatThinking';
import { ToolCallTimeline } from '@/components/chat/ToolCallTimeline';
import { reconstructSessionFromEvents } from '@/components/chat/reconstruct-session';

type RunDetail = ScheduledAiJobRunView & { actionId: string | null };
const eventTypes = [
  'status',
  'text_delta',
  'reasoning_delta',
  'search_results',
  'citations',
  'optimization',
  'image_ready',
  'completed',
  'error',
  'question',
  'tool_call',
  'tool_proposal',
  'tool_evidence',
];

export function ScheduledAiJobRunExecution({
  jobId,
  initialRun,
  initialEvents,
}: {
  jobId: string;
  initialRun: RunDetail;
  initialEvents: AiActionEvent[];
}) {
  const [run, setRun] = useState(initialRun);
  const [events, setEvents] = useState(initialEvents);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = run.status === 'queued' || run.status === 'running';
  const transcript = useMemo(() => reconstructSessionFromEvents(events), [events]);
  const proposals = useMemo(
    () =>
      events
        .filter((event) => event.type === 'tool_proposal')
        .map((event) => event.payload as AiToolProposalEventPayload),
    [events],
  );

  useEffect(() => {
    if (!run.actionId || !active) return;
    const source = new EventSource(
      `/api/ai/actions/${run.actionId}/events?after=${events.at(-1)?.id ?? 0}`,
    );
    const receive = (event: MessageEvent<string>) => {
      const id = Number(event.lastEventId);
      if (!Number.isSafeInteger(id) || id < 1) return;
      const type = event.type as AiActionEvent['type'];
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      setEvents((current) =>
        current.some((item) => item.id === id)
          ? current
          : [
              ...current,
              { id, actionId: run.actionId!, type, payload, createdAt: new Date().toISOString() },
            ],
      );
    };
    for (const type of eventTypes) source.addEventListener(type, receive);
    return () => {
      source.close();
    };
  }, [run.actionId, active, events]);

  useEffect(() => {
    if (!active) return;
    const refresh = async () => {
      try {
        setRun(await apiGet<RunDetail>(`/api/ai/scheduled-jobs/${jobId}/runs/${run.id}`));
      } catch {
        /* SSE remains useful during a transient poll failure. */
      }
    };
    const timer = window.setInterval(() => {
      void refresh();
    }, 2_500);
    void refresh();
    return () => window.clearInterval(timer);
  }, [active, jobId, run.id]);

  const stop = async () => {
    setStopping(true);
    setError(null);
    try {
      const updated = await apiPost<Record<string, never>, RunDetail>(
        `/api/ai/scheduled-jobs/${jobId}/runs/${run.id}/cancel`,
        {},
      );
      setRun({ ...updated, actionId: run.actionId });
    } catch (value) {
      setError((value as ApiError).message ?? 'Unable to stop this Job run.');
    } finally {
      setStopping(false);
    }
  };

  return (
    <section className="space-y-md rounded-lg border border-border p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-semibold">Execution</h2>
          <p className="text-sm text-muted">
            {run.status}
            {run.actionId ? ' · Wiki AI activity is shown live' : ' · Waiting for Wiki AI to start'}
          </p>
        </div>
        {active && (
          <Button variant="danger" disabled={stopping} onClick={() => void stop()}>
            {stopping ? 'Stopping…' : 'Stop run'}
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {transcript.question && (
        <article className="ml-auto max-w-3xl rounded-lg bg-primary p-sm text-sm text-primary-text whitespace-pre-wrap">
          {transcript.question}
        </article>
      )}
      <article className="max-w-4xl rounded-lg bg-surface-elevated p-sm text-sm">
        <ChatThinking thinking={transcript.thinking} streaming={active}>
          <>
            <ChatRetrieval results={transcript.searchResults} />
            <ToolCallTimeline calls={transcript.toolCalls} proposals={proposals} embedded />
          </>
        </ChatThinking>
        {transcript.answer ? (
          <ChatAnswer text={transcript.answer} citations={transcript.citations} done={!active} />
        ) : active ? (
          <p className="text-muted">{run.status === 'queued' ? 'Queued…' : 'Working…'}</p>
        ) : null}
        {transcript.errorMessage && <p className="mt-sm text-danger">{transcript.errorMessage}</p>}
        <ChatCitations citations={transcript.citations} />
      </article>
    </section>
  );
}
