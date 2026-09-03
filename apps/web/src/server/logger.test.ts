import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatExceptionDetail, formatExceptionMessage, logger, redactSensitiveText } from './logger';

function lastLogEntry(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1)!;
  // Test env logs `[timestamp] LEVEL: message JSON` — the JSON is the 2nd arg.
  return JSON.parse(call[1] as string);
}

describe('logger.exception', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures the full stack trace of a caught Error', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = new Error('boom');
    logger.exception('operation failed', error, { jobId: 'abc' });

    const entry = lastLogEntry(spy);
    expect(entry.level).toBe('error');
    expect(entry.jobId).toBe('abc');
    expect(entry.error).toMatchObject({ name: 'Error', message: 'boom' });
    expect((entry.error as { stack: string }).stack).toContain('boom');
    expect((entry.error as { stack: string }).stack).toContain('logger.test.ts');
  });

  it('handles a non-Error thrown value without crashing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.exception('operation failed', 'a plain string error');

    const entry = lastLogEntry(spy);
    expect(entry.error).toMatchObject({ name: 'NonError', message: 'a plain string error' });
  });

  it('redacts sensitive substrings inside the error message and stack', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.exception('git push failed', new Error('fatal: https://user:hunter2@github.com/o/r.git'));

    const entry = lastLogEntry(spy);
    const message = (entry.error as { message: string }).message;
    expect(message).not.toContain('hunter2');
    expect(message).toContain('[REDACTED]@');
  });
});

describe('formatted exception fields', () => {
  it('returns redacted, bounded operator-facing fields', () => {
    const error = new Error('request failed: https://user:secret@example.com/' + 'x'.repeat(700));
    const message = formatExceptionMessage(error, 80);
    const detail = formatExceptionDetail(error, 120);

    expect(message).not.toContain('secret');
    expect(message.length).toBeLessThanOrEqual(80);
    expect(detail).not.toContain('secret');
    expect(detail.length).toBeLessThanOrEqual(120);
    expect(detail).toContain('Error:');
  });
});

describe('logger.warnException', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs at warn level with the stack attached', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.warnException('invalid multipart form data', new Error('Unexpected end of form'));

    const entry = lastLogEntry(spy);
    expect(entry.level).toBe('warn');
    expect((entry.error as { stack: string }).stack).toContain('Unexpected end of form');
  });
});

describe('logger meta redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts known secret-shaped keys in meta', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.error('login failed', { userId: 'u1', password: 'hunter2', token: 'abc123' });

    const entry = lastLogEntry(spy);
    expect(entry.userId).toBe('u1');
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.token).toBe('[REDACTED]');
  });
});

describe('redactSensitiveText', () => {
  it('redacts URL userinfo credentials', () => {
    const out = redactSensitiveText('fatal: https://someone:hunter2@github.com/o/r.git');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[REDACTED]@');
  });

  it('redacts URL userinfo for compound schemes like git+ssh:// and http+unix://', () => {
    const gitSsh = redactSensitiveText('fatal: git+ssh://deploy:hunter2@example.com/repo.git');
    expect(gitSsh).not.toContain('hunter2');
    expect(gitSsh).toContain('[REDACTED]@');

    const httpUnix = redactSensitiveText('fatal: http+unix://user:hunter2@%2Fvar%2Frun%2Fdocker.sock/info');
    expect(httpUnix).not.toContain('hunter2');
    expect(httpUnix).toContain('[REDACTED]@');
  });

  it('redacts Bearer tokens', () => {
    const out = redactSensitiveText('rejected request with Authorization: Bearer abc.def-123');
    expect(out).not.toContain('abc.def-123');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts email addresses', () => {
    const out = redactSensitiveText('user not found: foo@bar.com');
    expect(out).not.toContain('foo@bar.com');
    expect(out).toContain('[REDACTED_EMAIL]');
  });

  it('redacts a caller-supplied known secret wherever it appears', () => {
    const out = redactSensitiveText('token abcdef1234 rejected', 'abcdef1234');
    expect(out).not.toContain('abcdef1234');
    expect(out).toContain('[REDACTED]');
  });

  it('leaves an ordinary message untouched', () => {
    expect(redactSensitiveText('page not found')).toBe('page not found');
  });
});
