/** Store a single canonical representation so all account entry points agree. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
