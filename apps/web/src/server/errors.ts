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
  | 'PAGE_PATH_CONFLICT' // 409: batch update path collision (010-ai-curation-api)
  | 'PAGE_PATH_RESERVED' // 409: page path shadows a built-in app/ route (new/edit/etc.)
  | 'STALE_REVISION'
  | 'REVISION_ALREADY_PUBLISHED'
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
  | 'MODEL_IN_USE'
  | 'CAPABILITY_MISMATCH'
  | 'CAPABILITY_UNSUPPORTED'
  | 'EMBEDDING_DIMENSIONS_REQUIRED'
  | 'INDEX_NOT_READY'
  | 'FULL_CONTEXT_TOO_LARGE'
  | 'INSUFFICIENT_WIKI_EVIDENCE'
  | 'RATE_LIMITED'
  | 'PROVIDER_AUTH_FAILED'
  | 'INPUT_TOO_LARGE'
  | 'CONTENT_REJECTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CANCELLED'
  | 'INVALID_TRANSFER_OPTIONS'
  | 'INVALID_ARCHIVE'
  | 'TRANSFER_NOT_FOUND'
  | 'TRANSFER_CONFLICT'
  | 'TRANSFER_ALREADY_RUNNING'
  | 'SOURCE_IN_USE'
  | 'ARTIFACT_IN_USE'
  | 'ARTIFACT_NOT_UPLOADABLE'
  | 'ARCHIVE_TOO_LARGE'
  | 'INVALID_ARCHIVE_TYPE'
  | 'UNSUPPORTED_ARCHIVE_VERSION'
  | 'UNSUPPORTED_SOURCE_CONTENT'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_INVALID_RESPONSE'
  | 'SOURCE_TIMEOUT'
  | 'RUN_NOT_ACTIVE'
  | 'RUN_NOT_PAUSED'
  | 'RUN_NOT_PAUSABLE'
  | 'RUN_NOT_CLEANABLE'
  // AI page translation (015).
  | 'INVALID_TRANSLATION_INPUT'
  | 'TRANSLATION_NOT_FOUND'
  | 'TRANSLATION_ALREADY_RUNNING'
  | 'SOURCE_NOT_TRANSLATABLE'
  | 'JOB_QUEUE_UNAVAILABLE'
  // Wiki writing modes (022).
  | 'SPACE_UNAVAILABLE'
  | 'SPACE_FORBIDDEN'
  | 'RAW_SPACE_IMMUTABLE'
  | 'OKF_TYPE_REQUIRED'
  | 'OKF_RESERVED_PATH'
  | 'LINK_TARGET_INVALID'
  | 'MODE_SWITCH_INVALID'
  | 'MODE_SWITCH_IN_PROGRESS'
  // Raw space dual-track storage + taxonomy (022 Phase 11).
  | 'RAW_CONTENT_TYPE_INVALID'
  | 'RAW_CONTENT_TYPE_MISMATCH'
  | 'RAW_CATEGORY_REQUIRED'
  | 'RAW_CATEGORY_RETIRED'
  | 'RAW_CATEGORY_HAS_ENTRIES'
  // Cross-space page move (admin reclassification).
  | 'PAGE_SPACE_MOVE_INVALID'
  // Raw conversation search (023).
  | 'DATA_SOURCE_UNAVAILABLE'
  | 'RAW_CATEGORY_SYSTEM_PROTECTED'
  | 'RAW_CONVERSATION_IMMUTABLE'
  | 'RAW_CONVERSATION_CAPTURE_FAILED'
  // Wiki AI tool runtime (026).
  | 'TOOLS_DISABLED'
  | 'TOOL_NOT_ENABLED'
  | 'TOOL_CAPABILITY_UNAVAILABLE'
  | 'TOOL_POLICY_REVIEW_REQUIRED'
  | 'TOOL_LOOP_LIMIT_REACHED'
  | 'TOOL_RESULT_TOO_LARGE'
  | 'TOOL_EVIDENCE_REQUIRED'
  | 'PROPOSAL_CONFLICT'
  | 'PROPOSAL_NOT_APPLICABLE'
  | 'EXTERNAL_PROVIDER_NOT_ACTIVATABLE';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
