import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderTranscript, scanSessions, DEFAULT_MAX_CHUNK_CHARACTERS, type SessionStoreEntry } from '../src/session-archive.js';

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

const T1 = Date.parse('2026-09-14T08:00:01.000Z');
const T2 = Date.parse('2026-09-14T08:00:02.000Z');
const T3 = Date.parse('2026-09-14T08:00:03.000Z');

function userTurn(id: string, text: string, timestamp = T1): string {
  return line({ type: 'message', id, parentId: null, timestamp: new Date(timestamp).toISOString(), message: { role: 'user', content: text, timestamp } });
}

function assistantTurn(id: string, parts: unknown[], timestamp = T2): string {
  return line({ type: 'message', id, parentId: null, timestamp: new Date(timestamp).toISOString(), message: { role: 'assistant', content: parts, timestamp } });
}

const HEADER = line({ type: 'session', version: 3, id: 'sess', timestamp: '2026-09-14T08:00:00.000Z', cwd: '/home/user' });

describe('renderTranscript', () => {
  it('renders user/assistant turns and folds tool calls, thinking, and results', () => {
    const jsonl = HEADER
      + userTurn('e1', 'Hello there')
      + assistantTurn('e2', [
        { type: 'text', text: 'Hi! Let me check.' },
        { type: 'thinking', thinking: 'considering options' },
        { type: 'toolCall', id: 't1', name: 'search', arguments: { q: 'x' } },
      ])
      + line({ type: 'message', id: 'e3', parentId: 'e2', timestamp: '2026-09-14T08:00:03.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'search', content: [{ type: 'text', text: 'result text' }], isError: false, timestamp: T3 } });

    const [chunk] = renderTranscript(jsonl, '876c9795-0aa5-4252-91af-473b4f0467ee');

    expect(chunk).toContain('# Session 876c9795');
    expect(chunk).toContain('## User — 2026-09-14T08:00:01.000Z\n\nHello there');
    expect(chunk).toContain('## Assistant — 2026-09-14T08:00:02.000Z');
    expect(chunk).toContain('Hi! Let me check.');
    expect(chunk).toContain('<details><summary>💭 thinking</summary>\n\nconsidering options');
    expect(chunk).toContain('<details><summary>🔧 search</summary>');
    expect(chunk).toContain('"q": "x"');
    expect(chunk).toContain('<details><summary>↩ result: search</summary>\n\nresult text');
  });

  it('marks a redacted thinking block and a failed tool result distinctly', () => {
    const jsonl = HEADER
      + assistantTurn('e1', [{ type: 'thinking', thinking: 'hidden', redacted: true }])
      + line({ type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'search', content: [{ type: 'text', text: 'boom' }], isError: true, timestamp: T2 } });

    const [chunk] = renderTranscript(jsonl, 'sess');

    expect(chunk).toContain('*[redacted by safety filter]*');
    expect(chunk).toContain('↩ result: search (error)');
  });

  it('renders an image content part as a placeholder instead of embedding data', () => {
    const jsonl = HEADER + line({ type: 'message', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', data: 'base64...', mimeType: 'image/png' }], timestamp: T1 } });

    const [chunk] = renderTranscript(jsonl, 'sess');
    expect(chunk).toContain('look');
    expect(chunk).toContain('*[image attached: image/png]*');
    expect(chunk).not.toContain('base64...');
  });

  it('skips non-message bookkeeping entries and malformed lines without failing', () => {
    const jsonl = HEADER
      + userTurn('e1', 'Hello')
      + line({ type: 'model_change', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', provider: 'anthropic', modelId: 'x' })
      + line({ type: 'session_info', id: 'e3', parentId: 'e2', timestamp: '2026-09-14T08:00:03.000Z', name: 'renamed' })
      + '{not valid json\n'
      + userTurn('e4', 'Second message', Date.parse('2026-09-14T08:00:05.000Z'));

    const [chunk] = renderTranscript(jsonl, 'sess');
    expect(chunk).toContain('Hello');
    expect(chunk).toContain('Second message');
    expect(chunk).not.toContain('model_change');
  });

  it('returns no chunks for a session with no archivable message turns', () => {
    const jsonl = HEADER + line({ type: 'model_change', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', provider: 'anthropic', modelId: 'x' });
    expect(renderTranscript(jsonl, 'sess')).toEqual([]);
  });

  it('splits into stable, append-preserving chunks once a turn would exceed the cap', () => {
    // Each turn (heading + 30-char body) is ~66 chars; 150 leaves room for one
    // whole turn per chunk (after title headroom) but not two.
    const maxChars = 150;
    const jsonl = HEADER + userTurn('e1', 'a'.repeat(30)) + userTurn('e2', 'b'.repeat(30), T2);
    const chunks = renderTranscript(jsonl, 'sess', maxChars);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('(part 1)');
    expect(chunks[0]).toContain('a'.repeat(30));
    expect(chunks[1]).toContain('(part 2)');
    expect(chunks[1]).toContain('b'.repeat(30));

    // Appending a third turn must not change the already-emitted first chunk's
    // content — chunk 1 stays byte-for-byte stable (its title omits the
    // running total on purpose) so a resync only re-mirrors the still-growing
    // tail, not the whole history.
    const grown = jsonl + userTurn('e3', 'c'.repeat(30), T3);
    const grownChunks = renderTranscript(grown, 'sess', maxChars);
    expect(grownChunks).toHaveLength(3);
    expect(grownChunks[0]).toBe(chunks[0]);
  });

  it('truncates a single turn that alone exceeds the cap instead of emitting an oversized chunk', () => {
    const jsonl = HEADER + userTurn('e1', 'x'.repeat(200));
    const [chunk] = renderTranscript(jsonl, 'sess', 100);

    expect(chunk!.length).toBeLessThanOrEqual(100);
    expect(chunk).toContain('*[truncated: this turn exceeds the per-page size limit]*');
  });
});

describe('scanSessions', () => {
  async function fixtureSession(dir: string, filename: string, content: string): Promise<string> {
    const filePath = join(dir, filename);
    await writeFile(filePath, content);
    return filePath;
  }

  it('archives only sessions that are neither heartbeat-isolated nor spawned', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-'));
    const realFile = await fixtureSession(dir, 'real.jsonl', HEADER + userTurn('e1', 'Hello'));
    const heartbeatFile = await fixtureSession(dir, 'heartbeat.jsonl', HEADER + userTurn('e1', 'noise'));
    const spawnedFile = await fixtureSession(dir, 'spawned.jsonl', HEADER + userTurn('e1', 'noise'));

    const entries: Array<{ sessionKey: string; entry: SessionStoreEntry }> = [
      { sessionKey: 'main', entry: { sessionId: 'real-id', sessionFile: realFile } },
      { sessionKey: 'main:heartbeat', entry: { sessionId: 'heartbeat-id', sessionFile: heartbeatFile, heartbeatIsolatedBaseSessionKey: 'main' } },
      { sessionKey: 'main:sub1', entry: { sessionId: 'spawned-id', sessionFile: spawnedFile, spawnedBy: 'main' } },
    ];
    const listSessionEntries = vi.fn(() => entries);
    const resolveSessionFilePath = vi.fn((sessionId: string, entry: { sessionFile?: string }) => entry.sessionFile ?? sessionId);
    const onSkip = vi.fn();

    const documents = await scanSessions({ agentId: 'main' }, onSkip, { listSessionEntries, resolveSessionFilePath });

    expect(documents.map((doc) => doc.sourcePath)).toEqual(['real-id/001.md']);
    expect(documents[0]?.content).toContain('Hello');
    expect(onSkip).not.toHaveBeenCalled();
    expect(listSessionEntries).toHaveBeenCalledWith({ agentId: 'main', storePath: undefined });
  });

  it('skips a session whose file cannot be read', async () => {
    const onSkip = vi.fn();
    const documents = await scanSessions(
      { agentId: 'main' },
      onSkip,
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'missing-id', sessionFile: '/nonexistent/path.jsonl' } }], resolveSessionFilePath: (_id, entry) => entry.sessionFile! },
    );

    expect(documents).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith('missing-id/001.md', 'unreadable');
  });

  it('skips a session whose path cannot be resolved', async () => {
    const onSkip = vi.fn();
    const documents = await scanSessions(
      { agentId: 'main' },
      onSkip,
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'broken-id' } }], resolveSessionFilePath: () => { throw new Error('cannot resolve'); } },
    );

    expect(documents).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith('broken-id/001.md', 'unreadable');
  });

  it('skips a session with no archivable turns as empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-empty-'));
    const filePath = await fixtureSession(dir, 'bookkeeping-only.jsonl', HEADER + line({ type: 'model_change', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', provider: 'a', modelId: 'b' }));
    const onSkip = vi.fn();

    const documents = await scanSessions(
      { agentId: 'main' },
      onSkip,
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'empty-id', sessionFile: filePath } }], resolveSessionFilePath: (_id, entry) => entry.sessionFile! },
    );

    expect(documents).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith('empty-id/001.md', 'empty');
  });

  it('emits one document per chunk for a session that crosses the chunk cap', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-chunked-'));
    // Two turns, each comfortably over half the default cap, force a 2-chunk split.
    const jsonl = HEADER
      + userTurn('e1', 'a'.repeat(DEFAULT_MAX_CHUNK_CHARACTERS * 0.6))
      + userTurn('e2', 'b'.repeat(DEFAULT_MAX_CHUNK_CHARACTERS * 0.6), 1_757_836_802_000);
    const filePath = await fixtureSession(dir, 'long.jsonl', jsonl);

    const documents = await scanSessions(
      { agentId: 'main' },
      vi.fn(),
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'long-id', sessionFile: filePath } }], resolveSessionFilePath: (_id, entry) => entry.sessionFile! },
    );

    expect(documents.map((doc) => doc.sourcePath)).toEqual(['long-id/001.md', 'long-id/002.md']);
    expect(documents.every((doc) => doc.content.length <= DEFAULT_MAX_CHUNK_CHARACTERS)).toBe(true);
  });

  it('rejects a symlinked session transcript', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-symlink-'));
    const realFile = await fixtureSession(dir, 'real.jsonl', HEADER + userTurn('e1', 'Hello'));
    const linkPath = join(dir, 'linked.jsonl');
    await symlink(realFile, linkPath);
    const onSkip = vi.fn();

    const documents = await scanSessions(
      { agentId: 'main' },
      onSkip,
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'linked-id', sessionFile: linkPath } }], resolveSessionFilePath: (_id, entry) => entry.sessionFile! },
    );

    expect(documents).toEqual([]);
    expect(onSkip).toHaveBeenCalledWith('linked-id/001.md', 'unreadable');
  });
});
