import { createHash } from 'node:crypto';
import type { CaptureMode } from './config.js';
import type { OutboxMessage } from './outbox.js';

const MAX_MESSAGES = 100;
const MAX_TOTAL_CONTENT_CHARS = 64_000;

/**
 * OpenClaw's own lifecycle hook payloads do not uniformly carry message
 * content: `agent_end` does, `before_compaction` optionally does, but
 * `after_compaction` and `session_end` carry only boundary metadata (message
 * counts, reasons, session ids) — confirmed against the installed SDK's
 * hook-types declarations, not assumed. A capture request for an event that
 * lacks usable content is a defined "safely skip" outcome, not an error.
 */
export type CaptureCandidate = {
  /** OpenClaw's own session identity (`ctx.sessionId` / event `sessionId`). Never a server-side identity. */
  sessionId: string;
  captureKind: CaptureMode;
  checkpoint: boolean;
  rawMessages: unknown;
};

export type CaptureRequest = {
  eventId: string;
  sessionDigest: string;
  captureKind: CaptureMode;
  checkpoint: boolean;
  messages: OutboxMessage[];
};

/**
 * A local-only correlation value (data-model.md: "one-way correlation...
 * never returned in a view or audit entry"), not a server-authorized
 * identity — the connection identity comes solely from the credential.
 */
export function sessionDigestFor(sessionId: string): string {
  return createHash('sha256').update(`openclaw-memory-bridge:${sessionId}`).digest('hex');
}

function normalizeMessages(rawMessages: unknown): OutboxMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const normalized: OutboxMessage[] = [];
  let total = 0;
  for (const raw of rawMessages.slice(-MAX_MESSAGES)) {
    const role = (raw as { role?: unknown } | null)?.role;
    const content = (raw as { content?: unknown } | null)?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.trim().length === 0) continue;
    const remaining = MAX_TOTAL_CONTENT_CHARS - total;
    if (remaining <= 0) break;
    const bounded = content.trim().slice(0, remaining);
    normalized.push({ role, content: bounded });
    total += bounded.length;
  }
  return normalized;
}

/**
 * Builds a deterministic, restart-safe capture request, or returns `null`
 * when the candidate event lacks the content required for the configured
 * capture mode (spec.md edge case: "lifecycle event lacks the content or
 * correlation fields required by the configured capture mode").
 */
export function buildCaptureRequest(candidate: CaptureCandidate): CaptureRequest | null {
  if (!candidate.sessionId) return null;
  const messages = normalizeMessages(candidate.rawMessages);
  if (messages.length === 0) return null;

  const sessionDigest = sessionDigestFor(candidate.sessionId);
  const evidence = JSON.stringify(messages);
  const eventId = createHash('sha256').update(`${sessionDigest}:${candidate.captureKind}:${evidence}`).digest('hex');

  return {
    eventId,
    sessionDigest,
    captureKind: candidate.captureKind,
    checkpoint: candidate.checkpoint,
    messages,
  };
}
