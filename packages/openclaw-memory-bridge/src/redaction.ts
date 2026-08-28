const SENSITIVE_KEYS = /token|secret|credential|authorization|prompt|content|query|title|session|payload/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEYS.test(key) ? '[redacted]' : redact(item),
  ]));
}

export function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  if (error instanceof TypeError) return 'transport_error';
  return 'bridge_error';
}
