import { env } from '@/server/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  [key: string]: unknown;
}

const SECRET_KEYS = new Set([
  'password',
  'passwordHash',
  'tempPassword',
  'newPassword',
  'token',
  'secret',
  'authorization',
  'cookie',
  'sessionId',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactSecrets(value: unknown, seen = new WeakSet()): unknown {
  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (isPlainObject(val)) {
      result[key] = redactSecrets(val, seen);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Strip credential-shaped substrings out of free-text (error messages, stack
 * traces). `redactSecrets` above only catches secrets carried as object
 * fields; this catches them when they've been interpolated into a string,
 * e.g. a git/ssh error echoing `https://user:token@host` or a log line built
 * from an `Authorization: Bearer <token>` header. `knownSecret` lets callers
 * redact one additional value they already hold (e.g. a git remote's stored
 * credential) that wouldn't otherwise match these generic patterns.
 */
export function redactSensitiveText(input: string, knownSecret?: string | null): string {
  let output = input;
  if (knownSecret && knownSecret.length >= 8) {
    output = output.split(knownSecret).join('[REDACTED]');
  }
  output = output.replace(/([\w+.-]+:\/\/)[^/\s@]*@/g, '$1[REDACTED]@');
  output = output.replace(/\b(Bearer\s+)\S+/gi, '$1[REDACTED]');
  output = output.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[REDACTED_EMAIL]');
  return output;
}

interface ExceptionInfo {
  name: string;
  message: string;
  stack: string;
}

function describeException(error: unknown): ExceptionInfo {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
      stack: redactSensitiveText(error.stack ?? `${error.name}: ${error.message}`),
    };
  }
  return {
    name: 'NonError',
    message: redactSensitiveText(String(error)),
    stack: redactSensitiveText(String(error)),
  };
}

/** Return a redacted, bounded message suitable for an operator-facing record. */
export function formatExceptionMessage(error: unknown, maxLength = 500): string {
  return describeException(error).message.slice(0, maxLength);
}

/** Return a redacted, bounded stack suitable for an operator-facing record. */
export function formatExceptionDetail(error: unknown, maxLength = 8_000): string {
  return describeException(error).stack.slice(0, maxLength);
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'next-wiki',
  };

  if (meta) {
    Object.assign(entry, redactSecrets(meta));
  }

  if (env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    console.log(`[${entry.timestamp}] ${level.toUpperCase()}: ${message}`, meta ? JSON.stringify(entry) : '');
  }
}

function writeException(level: LogLevel, message: string, error: unknown, meta?: Record<string, unknown>) {
  write(level, message, { ...meta, error: describeException(error) });
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
  /**
   * Log a caught exception with its full (redacted) stack trace. Prefer this
   * over `logger.error` whenever an actual `Error`/unknown catch value is in
   * hand — `logger.error` alone can't attach a stack, and hand-rolling
   * `error instanceof Error ? error.message : String(error)` at each call
   * site is exactly how stacks have been silently dropped across the
   * codebase.
   */
  exception: (message: string, error: unknown, meta?: Record<string, unknown>) => writeException('error', message, error, meta),
  /**
   * Same as `exception`, but for a caught error that's expected/tolerated
   * (e.g. malformed client input already mapped to a 4xx) rather than a bug —
   * still worth the stack trace for debugging, but not an `error`-level
   * alert.
   */
  warnException: (message: string, error: unknown, meta?: Record<string, unknown>) => writeException('warn', message, error, meta),
};
