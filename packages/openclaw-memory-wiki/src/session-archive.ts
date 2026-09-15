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
  /** Documented signal for a synthetic heartbeat/cron-created isolated session. Not observed set on real cron sessions — see isArchivableSession. */
  heartbeatIsolatedBaseSessionKey?: string;
  /** Documented signal for a sub-agent/tool-spawned session. Not confirmed to ever fire in practice — kept as defense in depth. */
  spawnedBy?: string;
};

export type SessionEntryLister = (params: { agentId?: string }) => Array<{ sessionKey: string; entry: SessionStoreEntry }>;
export type SessionFileResolver = (sessionId: string, entry: { sessionFile?: string }, opts?: { agentId?: string }) => string;
export type SessionArchiveDeps = { listSessionEntries: SessionEntryLister; resolveSessionFilePath: SessionFileResolver };

/** Real OpenClaw plugin-sdk session-store bindings; SyncService's default. Tests inject fakes instead. */
export const defaultSessionArchiveDeps: SessionArchiveDeps = { listSessionEntries: listSessionEntriesFromStore, resolveSessionFilePath: resolveSessionFilePathFromStore };

/**
 * On a real host, cron-triggered runs were observed as ordinary session-store
 * entries with `sessionKey` like `agent:main:cron:<jobId>` and NEITHER
 * `heartbeatIsolatedBaseSessionKey` NOR `spawnedBy` set — the documented
 * fields alone let every cron session through. The key pattern is therefore
 * the verified, primary signal; `:heartbeat` is kept for the documented
 * heartbeat naming even though it wasn't independently observed. The store
 * fields remain a defense-in-depth check in case some other code path does
 * set them.
 */
const SYNTHETIC_SESSION_KEY_PATTERN = /(?::heartbeat$)|(?::cron:)/u;

function isArchivableSession(sessionKey: string, entry: SessionStoreEntry): boolean {
  if (SYNTHETIC_SESSION_KEY_PATTERN.test(sessionKey)) return false;
  if (entry.heartbeatIsolatedBaseSessionKey) return false;
  if (entry.spawnedBy) return false;
  return true;
}

/** Constrain a session id to a single safe path segment; falls back to a digest for anything that sanitizes to nothing. */
function safeSessionSegment(sessionId: string): string {
  const normalized = sessionId.replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return normalized || createHash('sha256').update(sessionId, 'utf8').digest('hex').slice(0, 16);
}

// -- Transcript JSONL line shapes (openclaw's documented session format) --
// Types below describe the expected shape for readability; runtime code does
// NOT trust them blindly — renderTurn is called under a per-turn try/catch
// and the content renderers validate structure defensively, because this
// parses a format the SDK's own types flag as mid-migration.
type ThinkingContent = { type: 'thinking'; thinking: string; redacted?: boolean };
type ToolCall = { type: 'toolCall'; name: string; arguments: Record<string, unknown> };
type UserMessage = { role: 'user'; content: unknown; timestamp: unknown };
type AssistantMessage = { role: 'assistant'; content: unknown; timestamp: unknown };
type ToolResultMessage = { role: 'toolResult'; toolName: unknown; content: unknown; isError: unknown; timestamp: unknown };
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

/** Renders string or (text|image)-part content defensively — an unexpected shape degrades to a placeholder instead of throwing. */
function renderContentParts(parts: unknown): string {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '*[unrecognized content]*';
  return parts.map((part: unknown) => {
    if (!isRecord(part)) return '*[unrecognized content]*';
    if (part.type === 'text' && typeof part.text === 'string') return part.text;
    if (part.type === 'image') return `*[image attached: ${typeof part.mimeType === 'string' ? part.mimeType : 'unknown type'}]*`;
    return '*[unrecognized content]*';
  }).join('\n\n');
}

/**
 * Tool-call arguments and tool-result content routinely carry live secrets —
 * `exec` calls in particular commonly embed API keys and other credentials
 * verbatim, and a folded <details> block is not a security boundary; it's
 * still in the page body, indexed, and one click from visible. Both are
 * therefore omitted unless the caller explicitly opts in.
 */
function renderToolCall(call: ToolCall, includeToolCalls: boolean): string {
  if (!includeToolCalls) return `*[tool call: ${call.name} — arguments omitted; set sessionsIncludeToolCalls to include them]*`;
  const args = JSON.stringify(call.arguments, null, 2);
  return `<details><summary>🔧 ${call.name}</summary>\n\n\`\`\`json\n${args}\n\`\`\`\n\n</details>`;
}

function renderThinking(part: ThinkingContent): string {
  return `<details><summary>💭 thinking</summary>\n\n${part.redacted ? '*[redacted by safety filter]*' : part.thinking}\n\n</details>`;
}

/** Render one transcript entry into a readable Markdown block; tool calls, results, and thinking are folded. Throws on an unrecognized message shape — callers must guard per turn. */
function renderTurn(message: TranscriptMessage, includeToolCalls: boolean): string {
  const when = formatTimestamp(message.timestamp);
  if (message.role === 'user') return `## User — ${when}\n\n${renderContentParts(message.content)}`;
  if (message.role === 'assistant') {
    if (!Array.isArray(message.content)) throw new Error('assistant message content is not an array');
    const blocks = (message.content as unknown[]).map((part: unknown) => {
      if (!isRecord(part)) return '*[unrecognized content]*';
      if (part.type === 'text') return typeof part.text === 'string' ? part.text : '*[unrecognized content]*';
      if (part.type === 'thinking') return renderThinking(part as unknown as ThinkingContent);
      if (part.type === 'toolCall') return renderToolCall(part as unknown as ToolCall, includeToolCalls);
      return '*[unrecognized content]*';
    });
    return `## Assistant — ${when}\n\n${blocks.join('\n\n')}`;
  }
  const toolName = typeof message.toolName === 'string' ? message.toolName : 'unknown tool';
  const status = message.isError ? ' (error)' : '';
  if (!includeToolCalls) return `*[tool result: ${toolName}${status} — content omitted; set sessionsIncludeToolCalls to include it]*`;
  return `<details><summary>↩ result: ${toolName}${status}</summary>\n\n${renderContentParts(message.content)}\n\n</details>`;
}

function boundTurn(turn: string, maxChars: number): string {
  if (turn.length <= maxChars) return turn;
  const marker = '\n\n*[truncated: this turn exceeds the per-page size limit]*';
  return `${turn.slice(0, Math.max(0, maxChars - marker.length))}${marker}`;
}

/** Greedily pack rendered turns into ordered chunks that each stay under maxChars. Append-stable: an earlier chunk's content never changes once a later one exists. */
function chunkTurns(title: string, turns: string[], maxChars: number): string[] {
  // Every chunk is joined as `[${title} (part N), ...turns].join('\n\n')`.
  // buckets.length can never exceed turns.length (each turn contributes to at
  // most one new bucket), so this is an exact, structural upper bound on how
  // many digits the part number will ever need — no magic number, and it
  // stays correct no matter how many chunks a session eventually needs.
  const maxPartDigits = String(Math.max(1, turns.length)).length;
  const headroom = title.length + ` (part ${'9'.repeat(maxPartDigits)})`.length + 2;
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
  // The part suffix is unconditional, even for a single chunk: a session
  // that later grows into a second chunk must not rewrite chunk 1's title
  // (and therefore its digest) the moment that happens.
  return buckets.map((turnGroup, index) => [`${title} (part ${index + 1})`, ...turnGroup].join('\n\n'));
}

/**
 * Parse one session's JSONL transcript into readable Markdown chunks, one
 * `## User` / `## Assistant` section per message. Non-message bookkeeping
 * entries (compaction, model/thinking-level changes, labels, …) are skipped
 * to keep the archive focused on the actual conversation. A line that fails
 * to parse as JSON, or a message whose shape renderTurn doesn't recognize,
 * is skipped and logged rather than dropping the whole session. Returns []
 * when the session has no archivable turns.
 */
export function renderTranscript(jsonl: string, sessionId: string, options: { maxChars?: number; includeToolCalls?: boolean } = {}): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHUNK_CHARACTERS;
  const includeToolCalls = options.includeToolCalls ?? false;
  const turns: string[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    const message = asMessageLine(parsed);
    if (!message) continue;
    try {
      turns.push(renderTurn(message, includeToolCalls));
    } catch (error) {
      console.warn(`[next-wiki-memory-wiki] skipped a malformed transcript turn in session ${sessionId}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
  if (turns.length === 0) return [];
  return chunkTurns(`# Session ${sessionId.slice(0, 8)}`, turns, maxChars);
}

/**
 * Scan one OpenClaw agent's real (non-heartbeat, non-cron, non-spawned)
 * sessions and render each into one or more Markdown documents under
 * `<sessionId>/NNN.md`. Session discovery and file-path resolution go
 * through OpenClaw's own plugin-sdk session-store API rather than guessing
 * filesystem conventions.
 */
export async function scanSessions(
  params: { agentId: string; includeToolCalls?: boolean },
  onSkip: (sourcePath: string, reason: 'unreadable' | 'changed_during_scan' | 'empty') => void,
  deps: SessionArchiveDeps = defaultSessionArchiveDeps,
): Promise<VaultDocument[]> {
  const entries = deps.listSessionEntries({ agentId: params.agentId }).filter(({ sessionKey, entry }) => isArchivableSession(sessionKey, entry));
  const documents: VaultDocument[] = [];
  for (const { entry } of entries) {
    const sessionId = entry.sessionId;
    const base = `${safeSessionSegment(sessionId)}/`;
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
      const chunks = renderTranscript(content, sessionId, { includeToolCalls: params.includeToolCalls });
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
