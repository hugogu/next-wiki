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
  // Page attachments (034).
  | 'ATTACHMENT_TOO_LARGE' // 413: exceeds the configured max attachment size
  | 'UNSUPPORTED_ATTACHMENT_TYPE' // 415: not in the FR-010 allowlist / disabled category
  | 'AI_DISABLED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_FEATURE_DISABLED'
  | 'WEB_RESEARCH_UNAVAILABLE'
  | 'WEB_RESEARCH_ACCESS_DENIED'
  | 'WEB_RESEARCH_CONSENT_REQUIRED'
  | 'WEB_RESEARCH_POLICY_BLOCKED'
  | 'WEB_RESEARCH_BUDGET_EXCEEDED'
  | 'WEB_SOURCE_NOT_FOUND'
  | 'WEB_SOURCE_EXPIRED'
  | 'WEB_SOURCE_UNCAPTURABLE'
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
  | 'WIKIJS_HISTORY_FORBIDDEN'
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
  | 'MIGRATION_PREVIEW_NOT_FOUND'
  | 'STALE_MIGRATION_PREVIEW'
  | 'MIGRATION_ALREADY_RUNNING'
  | 'MIGRATION_CONFLICT'
  | 'MIGRATION_SELECTION_INVALID'
  | 'MIGRATION_DESTINATION_INVALID'
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
  | 'EXTERNAL_PROVIDER_NOT_ACTIVATABLE'
  // Agent Skills (028).
  | 'SKILL_NAME_TAKEN'
  | 'SKILL_NOT_FOUND'
  | 'SKILL_READ_ONLY'
  | 'SKILL_INVALID'
  | 'SKILL_PATH_INVALID'
  | 'SKILL_FILE_NOT_FOUND'
  | 'SKILL_FILE_CONFLICT'
  | 'SKILL_FILE_NOT_VIEWABLE'
  | 'SKILL_FILE_TOO_LARGE'
  | 'SKILL_DISABLED'
  // Page slug routing (035).
  | 'PAGE_SLUG_INVALID' // 400: fails pageAddressSchema — empty, too long, malformed, uppercase, non-ASCII
  | 'PAGE_SLUG_RESERVED' // 409: leading segment is a built-in route, locale, or static-site prefix
  | 'PAGE_SLUG_TAKEN' // 409: address is owned by another page's canonical slug (incl. soft-deleted)
  | 'PAGE_ADDRESS_TAKEN' // 409: address is an existing alias of another page
  | 'PAGE_ADDRESS_SELF' // 400: alias equals the page's own canonical slug
  | 'ADDRESS_ALIAS_RETAINED' // 409: retained-alias removal attempted without confirmation
  | 'PAGE_NOT_DELETED'; // 409: address release attempted on a live (non-deleted) page

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
