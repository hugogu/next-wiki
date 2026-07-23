'use client';

import { useCallback, useRef, useState } from 'react';
import type { AiActionAccepted, AiEventType } from '@next-wiki/shared';
import type { ApiError } from '@/lib/api/client';

export type AiClientEvent = { type: AiEventType; payload: Record<string, unknown> };

export function normalizeAiRequestError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return { code: candidate.code, message: candidate.message };
    }
    if (typeof candidate.message === 'string') {
      return { code: 'NETWORK_ERROR', message: candidate.message };
    }
  }
  return { code: 'NETWORK_ERROR', message: 'Unable to reach Wiki AI' };
}

export async function requestAiAction(path: string, input: unknown): Promise<AiActionAccepted> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw normalizeAiRequestError(error);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { code?: unknown }).code === 'string' &&
      typeof (body as { message?: unknown }).message === 'string'
    ) {
      throw body as ApiError;
    }
    throw {
      code: 'HTTP_ERROR',
      message: `Wiki AI request failed with status ${response.status}`,
    } satisfies ApiError;
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { id?: unknown }).id !== 'string' ||
    typeof (body as { eventsUrl?: unknown }).eventsUrl !== 'string'
  ) {
    throw { code: 'INVALID_RESPONSE', message: 'Wiki AI returned an invalid action response' } satisfies ApiError;
  }
  return body as AiActionAccepted;
}

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
    await cancel();
    setError(null);
    setRunning(true);
    try {
      const action = await requestAiAction(path, input);
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
    } catch (error) {
      const apiError = normalizeAiRequestError(error);
      setError(apiError);
      setRunning(false);
      actionIdRef.current = null;
      sourceRef.current?.close();
      sourceRef.current = null;
      throw apiError;
    }
  }, [cancel]);

  return { start, cancel, running, error };
}
