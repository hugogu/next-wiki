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
