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
  | 'STORAGE_UNAVAILABLE' // 503: the active backend could not be reached
  | 'AI_DISABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_FEATURE_DISABLED'
  | 'PROVIDER_IN_USE'
  | 'PROVIDER_DISABLED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'CAPABILITY_MISMATCH'
  | 'CAPABILITY_UNSUPPORTED'
  | 'EMBEDDING_DIMENSIONS_REQUIRED'
  | 'INDEX_NOT_READY'
  | 'FULL_CONTEXT_TOO_LARGE'
  | 'INSUFFICIENT_WIKI_EVIDENCE'
  | 'RATE_LIMITED'
  | 'INPUT_TOO_LARGE'
  | 'CONTENT_REJECTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
