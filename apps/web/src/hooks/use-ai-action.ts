'use client';

import { useCallback, useRef, useState } from 'react';
import type { AiActionAccepted, AiEventType } from '@next-wiki/shared';
import type { ApiError } from '@/lib/api/client';

export type AiClientEvent = { type: AiEventType; payload: Record<string, unknown> };

export function useAiAction() {
  const sourceRef = useRef<EventSource | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const cancel = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async (
    path: string,
    input: unknown,
    onEvent: (event: AiClientEvent) => void,
  ): Promise<AiActionAccepted> => {
    cancel();
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
          sourceRef.current = null;
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
