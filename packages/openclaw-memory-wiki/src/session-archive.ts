import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { listSessionEntries as listSessionEntriesFromStore, resolveSessionFilePath as resolveSessionFilePathFromStore } from 'openclaw/plugin-sdk/session-store-runtime';
import type { VaultDocument } from './vault-scanner.js';

/**
 * Soft cap for one mirrored transcript chunk. Kept comfortably below the
 * mirror endpoint's hard 512,000-character limit (see the REST contract and
 * `agentMemorySourceDocumentInputSchema`) so heading/whitespace overhead can
 * never push an emitted chunk over the server's actual ceiling.
 */
export const DEFAULT_MAX_CHUNK_CHARACTERS = 500_000;

/** Minimal shape of the OpenClaw session-store metadata record this module reads. */
export type SessionStoreEntry = {
  sessionId: string;
  sessionFile?: string;
  /** Set only on synthetic heartbeat/cron-created isolated sessions — never a real conversation. */
  heartbeatIsolatedBaseSessionKey?: string;
  /** Set on sub-agent/tool-spawned sessions — internal machinery, not a human conversation. */
  spawnedBy?: string;
};

export type SessionEntryLister = (params: { agentId?: string; storePath?: string }) => Array<{ sessionKey: string; entry: SessionStoreEntry }>;
export type SessionFileResolver = (sessionId: string, entry: { sessionFile?: string }, opts?: { agentId?: string }) => string;
export type SessionArchiveDeps = { listSessionEntries: SessionEntryLister; resolveSessionFilePath: SessionFileResolver };

/** Real OpenClaw plugin-sdk session-store bindings; SyncService's default. Tests inject fakes instead. */
export const defaultSessionArchiveDeps: SessionArchiveDeps = { listSessionEntries: listSessionEntriesFromStore, resolveSessionFilePath: resolveSessionFilePathFromStore };

function isArchivableSession(entry: SessionStoreEntry): boolean {
  // Heartbeat/cron runs create synthetic isolated sessions (`<base>:heartbeat`)
  // that never carry a real conversation; sub-agent / tool-spawned sessions are
  // internal machinery, not something a human would read back later. Everything
  // else — including forked/topic child sessions, which are real conversations
  // — is archived.
  if (entry.heartbeatIsolatedBaseSessionKey) return false;
  if (entry.spawnedBy) return false;
  return true;
}

// -- Transcript JSONL line shapes (openclaw's documented session format) --
type TextContent = { type: 'text'; text: string };
type ThinkingContent = { type: 'thinking'; thinking: string; redacted?: boolean };
type ImageContent = { type: 'image'; mimeType: string };
type ToolCall = { type: 'toolCall'; name: string; arguments: Record<string, unknown> };
type UserMessage = { role: 'user'; content: string | (TextContent | ImageContent)[]; timestamp: number };
type AssistantMessage = { role: 'assistant'; content: (TextContent | ThinkingContent | ToolCall)[]; timestamp: number };
type ToolResultMessage = { role: 'toolResult'; toolName: string; content: (TextContent | ImageContent)[]; isError: boolean; timestamp: number };
type TranscriptMessage = UserMessage | AssistantMessage | ToolResultMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asMessageLine(value: unknown): TranscriptMessage | undefined {
  if (!isRecord(value) || value.type !== 'message' || !isRecord(value.message)) return undefined;
  const message = value.message;
  if (message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult') return message as unknown as TranscriptMessage;
  return undefined;
}

function formatTimestamp(ms: unknown): string {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : 'unknown time';
}

function renderContentParts(parts: string | (TextContent | ImageContent)[]): string {
  if (typeof parts === 'string') return parts;
  return parts.map((part) => (part.type === 'text' ? part.text : `*[image attached: ${part.mimeType}]*`)).join('\n\n');
}

function renderToolCall(call: ToolCall): string {
  const args = JSON.stringify(call.arguments, null, 2);
  return `<details><summary>🔧 ${call.name}</summary>\n\n\`\`\`json\n${args}\n\`\`\`\n\n</details>`;
}

function renderThinking(part: ThinkingContent): string {
  return `<details><summary>💭 thinking</summary>\n\n${part.redacted ? '*[redacted by safety filter]*' : part.thinking}\n\n</details>`;
}

/** Render one transcript entry into a readable Markdown block; tool calls, results, and thinking are folded. */
function renderTurn(message: TranscriptMessage): string {
  const when = formatTimestamp(message.timestamp);
  if (message.role === 'user') return `## User — ${when}\n\n${renderContentParts(message.content)}`;
  if (message.role === 'assistant') {
    const blocks = message.content.map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'thinking') return renderThinking(part);
      return renderToolCall(part);
    });
    return `## Assistant — ${when}\n\n${blocks.join('\n\n')}`;
  }
  const status = message.isError ? ' (error)' : '';
  return `<details><summary>↩ result: ${message.toolName}${status}</summary>\n\n${renderContentParts(message.content)}\n\n</details>`;
}

function boundTurn(turn: string, maxChars: number): string {
  if (turn.length <= maxChars) return turn;
  const marker = '\n\n*[truncated: this turn exceeds the per-page size limit]*';
  return `${turn.slice(0, Math.max(0, maxChars - marker.length))}${marker}`;
}

/** Greedily pack rendered turns into ordered chunks that each stay under maxChars. Stable under append: earlier chunks never change once a later one exists. */
function chunkTurns(title: string, turns: string[], maxChars: number): string[] {
  // Every chunk is later joined as `[titleWithPartSuffix, ...turns].join('\n\n')`
  // — reserve room for that heading (worst case "(part 999)") up front so a
  // chunk that is exactly at budget from turns alone can never overflow once
  // the title is prepended. The suffix deliberately omits the running total:
  // embedding "of M" would change every earlier chunk's title (and digest)
  // each time the session grows into one more chunk, defeating the whole
  // point of append-stable chunk boundaries.
  const headroom = title.length + ' (part 999)'.length + 2;
  const effectiveMax = Math.max(1, maxChars - headroom);
  const buckets: string[][] = [[]];
  let currentLength = 0;
  for (const rawTurn of turns) {
    const turn = boundTurn(rawTurn, effectiveMax);
    if (currentLength > 0 && currentLength + turn.length + 2 > effectiveMax) {
      buckets.push([]);
      currentLength = 0;
    }
    buckets[buckets.length - 1]!.push(turn);
    currentLength += turn.length + 2;
  }
  return buckets.map((turnGroup, index) => [buckets.length > 1 ? `${title} (part ${index + 1})` : title, ...turnGroup].join('\n\n'));
}

/**
 * Parse one session's JSONL transcript into readable Markdown chunks, one
 * `## User` / `## Assistant` section per message. Non-message bookkeeping
 * entries (compaction, model/thinking-level changes, labels, …) are skipped
 * to keep the archive focused on the actual conversation. A malformed line
 * (e.g. a truncated in-flight last line) is skipped rather than aborting the
 * whole session. Returns [] when the session has no archivable turns.
 */
export function renderTranscript(jsonl: string, sessionId: string, maxChars = DEFAULT_MAX_CHUNK_CHARACTERS): string[] {
  const turns: string[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    const message = asMessageLine(parsed);
    if (message) turns.push(renderTurn(message));
  }
  if (turns.length === 0) return [];
  return chunkTurns(`# Session ${sessionId.slice(0, 8)}`, turns, maxChars);
}

/**
 * Scan one OpenClaw agent's real (non-heartbeat, non-spawned) sessions and
 * render each into one or more Markdown documents under `<sessionId>/NNN.md`.
 * Session discovery and file-path resolution go through OpenClaw's own
 * plugin-sdk session-store API rather than guessing filesystem conventions.
 */
export async function scanSessions(
  params: { agentId: string; storePath?: string },
  onSkip: (sourcePath: string, reason: 'unreadable' | 'changed_during_scan' | 'empty') => void,
  deps: SessionArchiveDeps = defaultSessionArchiveDeps,
): Promise<VaultDocument[]> {
  const entries = deps.listSessionEntries({ agentId: params.agentId, storePath: params.storePath }).filter(({ entry }) => isArchivableSession(entry));
  const documents: VaultDocument[] = [];
  for (const { entry } of entries) {
    const sessionId = entry.sessionId;
    const base = `${sessionId}/`;
    const placeholderPath = `${base}001.md`;
    let filePath: string;
    try {
      filePath = deps.resolveSessionFilePath(sessionId, entry, { agentId: params.agentId });
    } catch {
      onSkip(placeholderPath, 'unreadable');
      continue;
    }
    try {
      const stat = await lstat(filePath);
      if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in an OpenClaw session directory: ${sessionId}`);
      const content = await readFile(filePath, 'utf8');
      const after = await lstat(filePath);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
        onSkip(placeholderPath, 'changed_during_scan');
        continue;
      }
      const chunks = renderTranscript(content, sessionId);
      if (chunks.length === 0) {
        onSkip(placeholderPath, 'empty');
        continue;
      }
      chunks.forEach((chunkContent, index) => {
        const sourcePath = `${base}${String(index + 1).padStart(3, '0')}.md`;
        documents.push({ sourcePath, content: chunkContent, sourceDigest: createHash('sha256').update(chunkContent, 'utf8').digest('hex'), sizeBytes: Buffer.byteLength(chunkContent, 'utf8') });
      });
    } catch {
      onSkip(placeholderPath, 'unreadable');
    }
  }
  return documents;
}
