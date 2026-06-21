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
export const aiModelDiscoveryEnum = pgEnum('ai_model_discovery', [
  'openai',
  'openrouter',
  'anthropic',
  'none',
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
  'search_results',
  'citations',
  'optimization',
  'image_ready',
  'completed',
  'error',
]);
