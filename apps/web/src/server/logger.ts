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

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
