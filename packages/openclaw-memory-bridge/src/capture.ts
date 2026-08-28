import { createHash } from 'node:crypto';

const MAX_MESSAGES = 100;
const MAX_CONTENT = 64_000;

export type CaptureEvent = {
  eventId: string;
  sessionDigest: string;
  checkpoint: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export function captureEventId(kind: string, sessionId: string, boundary: string, messages: CaptureEvent['messages']): string {
  return createHash('sha256').update(JSON.stringify({ kind, sessionId, boundary, messages })).digest('hex');
}

export function normalizeCapture(kind: string, sessionId: string, boundary: string, messages: CaptureEvent['messages']): CaptureEvent {
  if (!sessionId || !boundary || messages.length === 0 || messages.length > MAX_MESSAGES) throw new Error('capture_context_missing');
  const normalized = messages.filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim());
  const length = normalized.reduce((total, message) => total + message.content.length, 0);
  if (!normalized.length || length > MAX_CONTENT) throw new Error('capture_content_invalid');
  const eventId = captureEventId(kind, sessionId, boundary, normalized);
  return {
    eventId,
    sessionDigest: createHash('sha256').update(sessionId).digest('hex'),
    checkpoint: kind === 'before_compaction' || kind === 'compaction',
    messages: normalized,
  };
}
