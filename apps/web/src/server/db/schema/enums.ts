import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'reader']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const revisionStatusEnum = pgEnum('revision_status', ['draft', 'published']);
// 022 (Phase 11): page_revisions.content_type is an open MIME-type string, not a
// closed enum — raw entries carry PDF/HTML/JSON/image/log content types. Grammar
// is enforced by a DB CHECK plus a service-layer MIME parser.
export const apiKeyScopeEnum = pgEnum('api_key_scope', [
  'view',
  'create',
  'edit',
  'delete',
  'share',
  'run',
  'storage',
  'preferences',
  'transfers',
  'manage_tags',
  'ai.read',
]);

// ---- Content storage (003) -------------------------------------------------

export const storageBackendTypeEnum = pgEnum('storage_backend_type', [
  'database',
  'local',
  's3',
  'git',
]);

export const storageBackendPurposeEnum = pgEnum('storage_backend_purpose', [
  'primary',
  'git_export',
]);

// 022 (Phase 11): content_assets.kind is an open label, not a closed enum — the
// same asset infrastructure now stores raw original bytes of any MIME type, and
// `content_assets.content_type` (a MIME string) is the real type source of truth.

export const migrationStatusEnum = pgEnum('migration_status', [
  'pending',
  'copying',
  'verifying',
  'completed',
  'failed',
  'aborted',
]);

export const cleanupStatusEnum = pgEnum('cleanup_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const storageReplicaStateEnum = pgEnum('storage_replica_state', [
  'disabled',
  'backfilling',
  'enabled',
  'degraded',
  'deleting',
]);

export const storageReplicationStatusEnum = pgEnum('storage_replication_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const storageObjectKindEnum = pgEnum('storage_object_kind', ['markdown', 'image']);
export const storageReplicationOperationEnum = pgEnum('storage_replication_operation', [
  'upsert',
  'delete',
]);

// ---- System AI (004) ------------------------------------------------------

export const aiProviderKindEnum = pgEnum('ai_provider_kind', [
  'openai_compatible',
  'openrouter',
  'anthropic',
  'voyage',
  'minimax',
]);
export const aiProviderTypeEnum = pgEnum('ai_provider_type', ['chat', 'embedding', 'image']);
export const aiProviderVendorEnum = pgEnum('ai_provider_vendor', [
  'openai',
  'openrouter',
  'anthropic',
  'kimi',
  'voyage',
  'minimax',
  'zai',
  'custom',
]);
export const aiProviderStatusEnum = pgEnum('ai_provider_status', [
  'unverified',
  'healthy',
  'unavailable',
  'disabled',
]);
export const aiModelAvailabilityEnum = pgEnum('ai_model_availability', [
  'available',
  'unavailable',
  'unknown',
]);
export const aiCapabilityEnum = pgEnum('ai_capability', [
  'text_generation',
  'embedding',
  'image_generation',
  'vision',
  'audio',
  'thinking',
  // 026: model can drive the governed Wiki AI tool loop.
  'tool_calling',
]);
export const aiCapabilitySourceEnum = pgEnum('ai_capability_source', [
  'provider',
  'catalog',
  'manual',
]);
export const aiPurposeEnum = pgEnum('ai_purpose', ['wiki_text', 'wiki_embedding', 'wiki_image']);
export const aiIndexStatusEnum = pgEnum('ai_index_status', [
  'building',
  'ready',
  'failed',
  'superseded',
]);
export const aiPageIndexStatusEnum = pgEnum('ai_page_index_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'removed',
]);
export const aiActionFeatureEnum = pgEnum('ai_action_feature', [
  'provider_test',
  'model_sync',
  'index_rebuild',
  'semantic_search',
  'wiki_question',
  'text_optimization',
  'image_generation',
  // 026: a tool-enabled chat turn driving the governed Wiki AI tool loop.
  'wiki_tool_chat',
]);
export const aiActionStatusEnum = pgEnum('ai_action_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export const aiQuestionModeEnum = pgEnum('ai_question_mode', ['full', 'retrieval']);
export const aiEventTypeEnum = pgEnum('ai_event_type', [
  'status',
  'text_delta',
  'reasoning_delta',
  'search_results',
  'citations',
  'optimization',
  'image_ready',
  'completed',
  'error',
  'question',
  // 026: governed tool-loop lifecycle events.
  'tool_call',
  'tool_proposal',
  'tool_evidence',
]);

// ---- Header hybrid search (013) -------------------------------------------

export const searchBehaviorActionEnum = pgEnum('search_behavior_action', ['result_open', 'escape']);

// ---- Complementary search engines (017) -----------------------------------

export const searchCapabilityIdEnum = pgEnum('search_capability_id', [
  'full_text',
  'fuzzy',
  'semantic',
]);

export const searchEngineRunStateEnum = pgEnum('search_engine_run_state', [
  'ready',
  'pending',
  'skipped',
  'unavailable',
  'failed',
  'timed_out',
]);

export const tagMutationKindEnum = pgEnum('tag_mutation_kind', ['rename', 'delete', 'merge']);
export const tagMutationStatusEnum = pgEnum('tag_mutation_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
]);

// ---- Content transfer (005) -----------------------------------------------

export const transferSourceTypeEnum = pgEnum('transfer_source_type', ['wikijs']);
export const transferSourceStatusEnum = pgEnum('transfer_source_status', [
  'unverified',
  'healthy',
  'unavailable',
  'disabled',
]);
export const transferRunKindEnum = pgEnum('transfer_run_kind', [
  'site_export',
  'archive_preview',
  'archive_import',
  'wikijs_source_test',
  'wikijs_preview',
  'wikijs_import',
]);
export const transferRunStatusEnum = pgEnum('transfer_run_status', [
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]);
export const transferRunPhaseEnum = pgEnum('transfer_run_phase', [
  'queued',
  'discovering',
  'validating',
  'planning',
  'downloading',
  'writing_assets',
  'writing_pages',
  'finalizing',
  'completed',
]);
export const transferItemKindEnum = pgEnum('transfer_item_kind', [
  'page',
  'asset',
  'archive_entry',
]);
export const transferItemActionEnum = pgEnum('transfer_item_action', [
  'create',
  'replace',
  'skip',
  'convert',
  'validate',
]);
export const transferItemStatusEnum = pgEnum('transfer_item_status', [
  'pending',
  'running',
  'completed',
  'warning',
  'failed',
  'cancelled',
]);
export const transferArtifactKindEnum = pgEnum('transfer_artifact_kind', [
  'source_archive',
  'export_archive',
  'run_report',
]);
export const transferArtifactStatusEnum = pgEnum('transfer_artifact_status', [
  'uploading',
  'ready',
  'expired',
  'deleted',
  'failed',
]);

// ---- AI page translation (015) --------------------------------------------

export const translationRunKindEnum = pgEnum('translation_run_kind', [
  'initial',
  'resume',
  'replacement',
  'refresh',
]);
export const translationRunStatusEnum = pgEnum('translation_run_status', [
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]);
export const translationItemStatusEnum = pgEnum('translation_item_status', [
  'pending',
  'running',
  'completed',
  'skipped',
  'failed',
  'cancelled',
  'superseded',
]);
export const translationFreshnessStatusEnum = pgEnum('translation_freshness_status', [
  'fresh',
  'stale',
  'queued',
  'running',
  'failed',
  'unavailable',
]);
export const translationUsageSourceEnum = pgEnum('translation_usage_source', [
  'provider_reported',
  'estimated',
  'unavailable',
]);

// ---- Feishu integration (019) ---------------------------------------------

/** Source channel of an audit entry. Existing rows default to `web`. */
export const auditOriginEnum = pgEnum('audit_origin', ['web', 'api', 'feishu']);

export const feishuConnectionModeEnum = pgEnum('feishu_connection_mode', ['webhook', 'websocket']);

export const feishuBindingStatusEnum = pgEnum('feishu_binding_status', ['active', 'revoked']);

export const feishuInboxStatusEnum = pgEnum('feishu_inbox_status', [
  'accepted',
  'processed',
  'rejected',
]);

export const feishuSessionStateEnum = pgEnum('feishu_session_state', [
  'active',
  'expired',
  'reset',
]);

export const feishuNotificationEventTypeEnum = pgEnum('feishu_notification_event_type', [
  'page_published',
  'ai_action_completed',
  'transfer_completed',
]);

export const feishuSubscriptionModeEnum = pgEnum('feishu_subscription_mode', [
  'direct',
  'public_safe_group',
  'private_recipients_group',
]);

export const feishuSubscriptionStatusEnum = pgEnum('feishu_subscription_status', [
  'active',
  'paused',
  'failing',
  'action_required',
]);

export const feishuDeliveryStatusEnum = pgEnum('feishu_delivery_status', [
  'queued',
  'running',
  'delivered',
  'retry',
  'failed',
  'blocked',
  'expired',
]);

// ---- First-run onboarding (021) ---------------------------------------------

export const setupAccountStatusEnum = pgEnum('setup_account_status', ['needed', 'created']);

export const setupAiStatusEnum = pgEnum('setup_ai_status', [
  'not_started',
  'skipped',
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'disabled',
]);

export const setupSamplePagesStatusEnum = pgEnum('setup_sample_pages_status', [
  'not_started',
  'skipped',
  'completed',
  'partial',
  'failed',
]);

export const setupStepEnum = pgEnum('setup_step', [
  'account',
  'ai',
  'writing_mode',
  'sample_pages',
  'summary',
  'closed',
]);

// ---- Wiki writing modes (022) ----------------------------------------------

export const writingModeEnum = pgEnum('writing_mode', ['copilot', 'llm-wiki']);

export const spaceKindEnum = pgEnum('space_kind', ['wiki', 'raw', 'generated']);

export const pageKindEnum = pgEnum('page_kind', ['native', 'link']);

export const actorKindEnum = pgEnum('actor_kind', ['human', 'machine']);

export const contentNatureEnum = pgEnum('content_nature', ['original', 'generated']);

export const pageVisibilityEnum = pgEnum('page_visibility', ['public', 'restricted']);

// ---- Raw Conversation Search (023) -----------------------------------------

export const rawConversationCaptureStatusEnum = pgEnum('raw_conversation_capture_status', [
  'not_applicable',
  'pending',
  'captured',
  'failed',
  'disabled',
]);

// ---- Web analytics integrations (024) --------------------------------------

export const analyticsProviderEnum = pgEnum('analytics_provider', [
  'baidu_tongji',
  'google_analytics',
]);

// ---- Wiki AI Tool Runtime (026) --------------------------------------------
// Mirrors the enum values in packages/shared/src/ai-tools.ts; the schema
// regression test and shared validation test guard the two against drift.

export const aiToolProviderKindEnum = pgEnum('ai_tool_provider_kind', [
  'builtin_wiki',
  'external_mcp',
]);
export const aiToolActivationStatusEnum = pgEnum('ai_tool_activation_status', [
  'available',
  'disabled',
  'unsupported',
  'future_external',
]);
export const aiToolCategoryEnum = pgEnum('ai_tool_category', [
  'read',
  'page_draft',
  'metadata',
  'tag',
  'batch',
  'raw_evidence',
]);
export const aiToolRiskLevelEnum = pgEnum('ai_tool_risk_level', [
  'read',
  'draft_write',
  'reviewed_write',
  'immediate_write',
]);
export const aiToolResultRetentionEnum = pgEnum('ai_tool_result_retention', [
  'conversation_summary',
  'raw_when_durable',
  'never_full_result',
]);
export const aiToolReviewPolicyEnum = pgEnum('ai_tool_review_policy', [
  'always_review',
  'review_when_requested',
  'allow_immediate_for_owner',
]);
export const aiToolReviewDecisionEnum = pgEnum('ai_tool_review_decision', [
  'none',
  'admin_review',
]);
export const aiToolWorkflowStatusEnum = pgEnum('ai_tool_workflow_status', [
  'queued',
  'running',
  'waiting_review',
  'completed',
  'failed',
  'cancelled',
  'limit_reached',
]);
export const aiToolCallStatusEnum = pgEnum('ai_tool_call_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'cancelled',
]);
export const aiToolProposalKindEnum = pgEnum('ai_tool_proposal_kind', [
  'tag_update',
  'metadata_update',
  'batch_update',
  'raw_evidence_link',
  'other',
]);
export const aiToolProposalStatusEnum = pgEnum('ai_tool_proposal_status', [
  'pending',
  'approved',
  'rejected',
  'applied',
  'failed',
  'superseded',
]);
export const aiToolProposalItemResourceKindEnum = pgEnum('ai_tool_proposal_item_resource_kind', [
  'page',
  'tag',
  'page_metadata',
  'raw_category',
  'link',
]);
export const aiToolProposalItemApplyStatusEnum = pgEnum('ai_tool_proposal_item_apply_status', [
  'pending',
  'applied',
  'failed',
  'skipped',
]);
export const aiToolEvidenceTargetKindEnum = pgEnum('ai_tool_evidence_target_kind', [
  'page_revision',
  'proposal',
  'tag_mutation',
  'metadata_change',
]);
