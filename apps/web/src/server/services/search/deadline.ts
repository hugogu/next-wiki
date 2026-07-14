/** Raised when an engine exceeds its per-request budget; maps to `timed_out`. */
export class EngineDeadlineExceeded extends Error {
  constructor() {
    super('Search engine exceeded its request budget');
    this.name = 'EngineDeadlineExceeded';
  }
}

/** PostgreSQL SQLSTATE for a statement cancelled by `statement_timeout`. */
export function isDatabaseDeadline(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '57014';
}
