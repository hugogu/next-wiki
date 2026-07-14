import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'reader']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const revisionStatusEnum = pgEnum('revision_status', ['draft', 'published']);
export const contentTypeEnum = pgEnum('content_type', ['text/markdown']);
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

export const contentAssetKindEnum = pgEnum('content_asset_kind', ['image']);

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
]);
export const aiCapabilitySourceEnum = pgEnum('ai_capability_source', [
  'provider',
  'catalog',
  'manual',
]);
export const aiPurposeEnum = pgEnum('ai_purpose', [
  'wiki_text',
  'wiki_embedding',
  'wiki_image',
]);
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
export const tagMutationStatusEnum = pgEnum('tag_mutation_status', ['queued', 'running', 'succeeded', 'failed']);

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

export const feishuConnectionModeEnum = pgEnum('feishu_connection_mode', ['webhook']);

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
