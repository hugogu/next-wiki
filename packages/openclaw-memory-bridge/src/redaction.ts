/**
 * Bounds and strips any substring that looks like the configured credential
 * from a diagnostic string, mirroring the Hermes provider's `redaction.py`.
 * Used only for messages that may reach logs or tool-call error output.
 */
export function redact(message: string, secrets: readonly string[] = []): string {
  let redacted = message;
  for (const secret of secrets) {
    if (secret.length < 6) continue;
    redacted = redacted.split(secret).join('[redacted]');
  }
  return redacted.length > 500 ? `${redacted.slice(0, 500)}…` : redacted;
}
