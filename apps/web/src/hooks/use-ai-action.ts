'use client';

import { useCallback, useRef, useState } from 'react';
import type { AiActionAccepted, AiEventType } from '@next-wiki/shared';
import type { ApiError } from '@/lib/api/client';

export type AiClientEvent = { type: AiEventType; payload: Record<string, unknown> };

export function useAiAction() {
  const sourceRef = useRef<EventSource | null>(null);
  const actionIdRef = useRef<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const cancel = useCallback(async () => {
    const actionId = actionIdRef.current;
    actionIdRef.current = null;
    sourceRef.current?.close();
    sourceRef.current = null;
    setRunning(false);
    if (!actionId) return;
    try {
      // Closing an EventSource only stops delivery to the browser. Flag the
      // server action too, so its provider request receives the cancellation.
      await fetch(`/api/ai/actions/${actionId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // The stream is already detached. A transient cancellation request
      // failure must not turn the current chat message into a user-facing error.
    }
  }, []);

  const start = useCallback(async (
    path: string,
    input: unknown,
    onEvent: (event: AiClientEvent) => void,
  ): Promise<AiActionAccepted> => {
    void cancel();
    setError(null);
    setRunning(true);
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiError = body as ApiError;
      setError(apiError);
      setRunning(false);
      throw apiError;
    }
    const action = body as AiActionAccepted;
    actionIdRef.current = action.id;
    const source = new EventSource(action.eventsUrl);
    sourceRef.current = source;
    const eventTypes: AiEventType[] = [
      'status', 'text_delta', 'reasoning_delta', 'search_results', 'citations', 'optimization',
      'image_ready', 'tool_call', 'tool_proposal', 'tool_evidence', 'completed', 'error',
    ];
    for (const type of eventTypes) {
      source.addEventListener(type, (raw) => {
        const event = raw as MessageEvent<string>;
        const payload = JSON.parse(event.data || '{}') as Record<string, unknown>;
        onEvent({ type, payload });
        if (type === 'completed' || type === 'error') {
          source.close();
          if (sourceRef.current === source) sourceRef.current = null;
          if (actionIdRef.current === action.id) actionIdRef.current = null;
          setRunning(false);
          if (type === 'error') setError({ code: String(payload.code ?? 'AI_ERROR'), message: String(payload.message ?? 'AI action failed') });
        }
      });
    }
    source.onerror = () => {
      // Native EventSource reconnects with Last-Event-ID. Terminal events close explicitly.
    };
    return action;
  }, [cancel]);

  return { start, cancel, running, error };
}
