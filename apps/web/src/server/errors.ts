/**
 * Domain error raised by the service layer. `code` mirrors the subset of tRPC
 * error codes the app uses, so the tRPC boundary can map it 1:1 (see
 * `domainErrorMiddleware`) without the service layer depending on tRPC.
 *
 * This keeps clients on a stable `error.data.code` contract and ensures safe,
 * meaningful messages reach the browser even in production, where tRPC
 * otherwise masks uncaught errors as opaque 500s.
 */
export type DomainErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  // Content storage (003).
  | 'INVALID_IMAGE' // 400: rejected upload (bad type/size)
  | 'STORAGE_MIGRATING' // 423: write blocked by an in-progress backend migration
  | 'STORAGE_UNAVAILABLE'; // 503: the active backend could not be reached

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
