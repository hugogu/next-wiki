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
  it('renders user/assistant turns and folds thinking (tool calls/results covered separately)', () => {
    const jsonl = HEADER
      + userTurn('e1', 'Hello there')
      + assistantTurn('e2', [
        { type: 'text', text: 'Hi! Let me check.' },
        { type: 'thinking', thinking: 'considering options' },
      ]);

    const [chunk] = renderTranscript(jsonl, '876c9795-0aa5-4252-91af-473b4f0467ee');

    expect(chunk).toContain('# Session 876c9795 (part 1)');
    expect(chunk).toContain('## User — 2026-09-14T08:00:01.000Z\n\nHello there');
    expect(chunk).toContain('## Assistant — 2026-09-14T08:00:02.000Z');
    expect(chunk).toContain('Hi! Let me check.');
    expect(chunk).toContain('<details><summary>💭 thinking</summary>\n\nconsidering options');
  });

  it('marks a redacted thinking block distinctly', () => {
    const jsonl = HEADER + assistantTurn('e1', [{ type: 'thinking', thinking: 'hidden', redacted: true }]);
    const [chunk] = renderTranscript(jsonl, 'sess');
    expect(chunk).toContain('*[redacted by safety filter]*');
  });

  it('marks a failed tool result distinctly when tool details are included', () => {
    const jsonl = HEADER + line({ type: 'message', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'search', content: [{ type: 'text', text: 'boom' }], isError: true, timestamp: T1 } });
    const [chunk] = renderTranscript(jsonl, 'sess', { includeToolCalls: true });
    expect(chunk).toContain('↩ result: search (error)');
    expect(chunk).toContain('boom');
  });

  it('renders an image content part as a placeholder instead of embedding data', () => {
    const jsonl = HEADER + line({ type: 'message', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', data: 'base64...', mimeType: 'image/png' }], timestamp: T1 } });

    const [chunk] = renderTranscript(jsonl, 'sess');
    expect(chunk).toContain('look');
    expect(chunk).toContain('*[image attached: image/png]*');
    expect(chunk).not.toContain('base64...');
  });

  it('skips non-message bookkeeping entries and malformed JSON lines without failing', () => {
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

  describe('malformed message shapes (valid JSON, unexpected structure)', () => {
    it('skips a turn whose shape renderTurn cannot handle, logs it, and keeps the rest of the session', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const jsonl = HEADER
          + userTurn('e1', 'Hello')
          // assistant content is a string, not an array — asMessageLine lets it
          // through (only role is checked), renderTurn must reject it safely.
          + line({ type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', message: { role: 'assistant', content: 'not-an-array', timestamp: T2 } })
          + userTurn('e3', 'Still here', Date.parse('2026-09-14T08:00:03.000Z'));

        const [chunk] = renderTranscript(jsonl, 'my-session-id');
        expect(chunk).toContain('Hello');
        expect(chunk).toContain('Still here');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('skipped a malformed transcript turn in session my-session-id'));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('renders a placeholder instead of throwing for unrecognized user/tool-result content', () => {
      const jsonl = HEADER
        + line({ type: 'message', id: 'e1', parentId: null, timestamp: '2026-09-14T08:00:01.000Z', message: { role: 'user', content: null, timestamp: T1 } })
        + line({ type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'x', content: { weird: true }, isError: false, timestamp: T2 } });

      const [chunk] = renderTranscript(jsonl, 'sess', { includeToolCalls: true });
      expect(chunk).toContain('*[unrecognized content]*');
    });
  });

  describe('tool call / result redaction', () => {
    it('omits tool-call arguments and tool-result content by default', () => {
      const jsonl = HEADER
        + assistantTurn('e1', [{ type: 'toolCall', id: 't1', name: 'exec', arguments: { cmd: 'curl -H "Authorization: Bearer SECRET123"' } }])
        + line({ type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'exec', content: [{ type: 'text', text: 'SECRET123 leaked here' }], isError: false, timestamp: T2 } });

      const [chunk] = renderTranscript(jsonl, 'sess');
      expect(chunk).not.toContain('SECRET123');
      expect(chunk).toContain('*[tool call: exec — arguments omitted');
      expect(chunk).toContain('*[tool result: exec — content omitted');
    });

    it('includes full tool-call arguments and tool-result content when explicitly enabled', () => {
      const jsonl = HEADER
        + assistantTurn('e1', [{ type: 'toolCall', id: 't1', name: 'exec', arguments: { cmd: 'echo hi' } }])
        + line({ type: 'message', id: 'e2', parentId: 'e1', timestamp: '2026-09-14T08:00:02.000Z', message: { role: 'toolResult', toolCallId: 't1', toolName: 'exec', content: [{ type: 'text', text: 'hi' }], isError: false, timestamp: T2 } });

      const [chunk] = renderTranscript(jsonl, 'sess', { includeToolCalls: true });
      expect(chunk).toContain('"cmd": "echo hi"');
      expect(chunk).toContain('<details><summary>↩ result: exec</summary>\n\nhi');
    });
  });

  describe('chunking', () => {
    it('splits into stable, append-preserving chunks once turns together exceed the cap', () => {
      // Each turn (heading + 30-char body) is ~66 chars; 150 leaves room for
      // one whole turn per chunk (after title headroom) but not two.
      const maxChars = 150;
      const jsonl = HEADER + userTurn('e1', 'a'.repeat(30)) + userTurn('e2', 'b'.repeat(30), T2);
      const chunks = renderTranscript(jsonl, 'sess', { maxChars });

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toContain('(part 1)');
      expect(chunks[0]).toContain('a'.repeat(30));
      expect(chunks[1]).toContain('(part 2)');
      expect(chunks[1]).toContain('b'.repeat(30));

      const grown = jsonl + userTurn('e3', 'c'.repeat(30), T3);
      const grownChunks = renderTranscript(grown, 'sess', { maxChars });
      expect(grownChunks).toHaveLength(3);
      expect(grownChunks[0]).toBe(chunks[0]);
    });

    it('keeps chunk 1 stable across the 1-chunk to 2-chunk boundary specifically', () => {
      // The part suffix is unconditional (always "(part 1)", never bare),
      // so crossing from a single chunk into a second one must not change
      // chunk 1's title — and therefore not its digest.
      const maxChars = 150;
      const jsonl = HEADER + userTurn('e1', 'solo');
      const [singleChunk] = renderTranscript(jsonl, 'sess', { maxChars });
      expect(singleChunk).toContain('(part 1)');

      const grown = jsonl + userTurn('e2', 'b'.repeat(200), T2);
      const grownChunks = renderTranscript(grown, 'sess', { maxChars });
      expect(grownChunks).toHaveLength(2);
      expect(grownChunks[0]).toBe(singleChunk);
    });

    it('truncates a single turn that alone exceeds the cap instead of emitting an oversized chunk', () => {
      const jsonl = HEADER + userTurn('e1', 'x'.repeat(200));
      const [chunk] = renderTranscript(jsonl, 'sess', { maxChars: 100 });

      expect(chunk!.length).toBeLessThanOrEqual(100);
      expect(chunk).toContain('*[truncated: this turn exceeds the per-page size limit]*');
    });

    it('reserves headroom for a 4+ digit part number so no chunk exceeds maxChars at real scale', () => {
      // ~1200 tiny turns forced into ~1-turn-per-chunk buckets: with the old
      // hardcoded "(part 999)" headroom this would silently overflow once
      // the part number reached 4 digits.
      const maxChars = 90;
      let jsonl = HEADER;
      for (let i = 0; i < 1200; i++) jsonl += userTurn(`e${i}`, 'x'.repeat(20), T1 + i);

      const chunks = renderTranscript(jsonl, 'sess', { maxChars });

      expect(chunks.length).toBeGreaterThan(999);
      expect(chunks.every((c) => c.length <= maxChars)).toBe(true);
      expect(chunks[chunks.length - 1]).toMatch(/\(part \d{4}\)/);
    });
  });
});

describe('scanSessions', () => {
  async function fixtureSession(dir: string, filename: string, content: string): Promise<string> {
    const filePath = join(dir, filename);
    await writeFile(filePath, content);
    return filePath;
  }

  it('archives real sessions, excluding heartbeat-field and spawnedBy-field sessions', async () => {
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
    expect(listSessionEntries).toHaveBeenCalledWith({ agentId: 'main' });
  });

  it('excludes a cron session by sessionKey pattern even when store fields are absent, matching real-host behavior', async () => {
    // Confirmed against a live installation: cron-triggered sessions carry
    // sessionKey `agent:<agentId>:cron:<jobId>` but neither
    // heartbeatIsolatedBaseSessionKey nor spawnedBy — the field-only check
    // alone lets every cron run through.
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-cron-'));
    const realFile = await fixtureSession(dir, 'real.jsonl', HEADER + userTurn('e1', 'Hello'));
    const cronFile = await fixtureSession(dir, 'cron.jsonl', HEADER + userTurn('e1', 'noise'));

    const entries: Array<{ sessionKey: string; entry: SessionStoreEntry }> = [
      { sessionKey: 'agent:main', entry: { sessionId: 'real-id', sessionFile: realFile } },
      { sessionKey: 'agent:main:cron:daily-digest', entry: { sessionId: 'cron-id', sessionFile: cronFile } },
    ];
    const documents = await scanSessions({ agentId: 'main' }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });

    expect(documents.map((doc) => doc.sourcePath)).toEqual(['real-id/001.md']);
  });

  it('excludes a heartbeat session by sessionKey suffix even when the store field is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-hb-key-'));
    const hbFile = await fixtureSession(dir, 'hb.jsonl', HEADER + userTurn('e1', 'noise'));
    const entries: Array<{ sessionKey: string; entry: SessionStoreEntry }> = [
      { sessionKey: 'main:heartbeat', entry: { sessionId: 'hb-id', sessionFile: hbFile } },
    ];
    const documents = await scanSessions({ agentId: 'main' }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });

    expect(documents).toEqual([]);
  });

  it('sanitizes a session id before using it as a path segment', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-traversal-'));
    const filePath = await fixtureSession(dir, 'x.jsonl', HEADER + userTurn('e1', 'Hello'));
    const entries = [{ sessionKey: 'main', entry: { sessionId: '../../etc/passwd', sessionFile: filePath } }];

    const documents = await scanSessions({ agentId: 'main' }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });

    expect(documents).toHaveLength(1);
    const sourcePath = documents[0]!.sourcePath;
    expect(sourcePath).not.toContain('..');
    expect(sourcePath.split('/')).toHaveLength(2);
  });

  it('falls back to a digest path segment when a session id sanitizes to nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-empty-id-'));
    const filePath = await fixtureSession(dir, 'x.jsonl', HEADER + userTurn('e1', 'Hello'));
    const entries = [{ sessionKey: 'main', entry: { sessionId: '///', sessionFile: filePath } }];

    const documents = await scanSessions({ agentId: 'main' }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });

    expect(documents).toHaveLength(1);
    expect(documents[0]?.sourcePath).toMatch(/^[a-f0-9]{16}\/001\.md$/);
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
      + userTurn('e2', 'b'.repeat(DEFAULT_MAX_CHUNK_CHARACTERS * 0.6), T2);
    const filePath = await fixtureSession(dir, 'long.jsonl', jsonl);

    const documents = await scanSessions(
      { agentId: 'main' },
      vi.fn(),
      { listSessionEntries: () => [{ sessionKey: 'main', entry: { sessionId: 'long-id', sessionFile: filePath } }], resolveSessionFilePath: (_id, entry) => entry.sessionFile! },
    );

    expect(documents.map((doc) => doc.sourcePath)).toEqual(['long-id/001.md', 'long-id/002.md']);
    expect(documents.every((doc) => doc.content.length <= DEFAULT_MAX_CHUNK_CHARACTERS)).toBe(true);
  });

  it('omits tool-call arguments by default and includes them when includeToolCalls is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openclaw-sessions-redact-'));
    const jsonl = HEADER + assistantTurn('e1', [{ type: 'toolCall', id: 't1', name: 'exec', arguments: { cmd: 'echo SECRET' } }]);
    const filePath = await fixtureSession(dir, 'tool.jsonl', jsonl);
    const entries = [{ sessionKey: 'main', entry: { sessionId: 'tool-id', sessionFile: filePath } }];

    const redacted = await scanSessions({ agentId: 'main' }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });
    expect(redacted[0]?.content).not.toContain('SECRET');

    const full = await scanSessions({ agentId: 'main', includeToolCalls: true }, vi.fn(), { listSessionEntries: () => entries, resolveSessionFilePath: (_id, entry) => entry.sessionFile! });
    expect(full[0]?.content).toContain('SECRET');
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
