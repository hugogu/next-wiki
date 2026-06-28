import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  bigserial,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import {
  apiKeyScopeEnum,
  cleanupStatusEnum,
  contentAssetKindEnum,
  contentTypeEnum,
  migrationStatusEnum,
  revisionStatusEnum,
  storageBackendPurposeEnum,
  storageObjectKindEnum,
  storageReplicaStateEnum,
  storageReplicationOperationEnum,
  storageReplicationStatusEnum,
  storageBackendTypeEnum,
  userRoleEnum,
  userStatusEnum,
  aiProviderKindEnum,
  aiProviderTypeEnum,
  aiProviderVendorEnum,
  aiProviderStatusEnum,
  aiModelAvailabilityEnum,
  aiCapabilityEnum,
  aiCapabilitySourceEnum,
  aiPurposeEnum,
  aiIndexStatusEnum,
  aiPageIndexStatusEnum,
  aiActionFeatureEnum,
  aiActionStatusEnum,
  aiQuestionModeEnum,
  aiEventTypeEnum,
  transferSourceTypeEnum,
  transferSourceStatusEnum,
  transferRunKindEnum,
  transferRunStatusEnum,
  transferRunPhaseEnum,
  transferItemKindEnum,
  transferItemActionEnum,
  transferItemStatusEnum,
  transferArtifactKindEnum,
  transferArtifactStatusEnum,
} from './enums';

/** PostgreSQL `bytea` column carrying raw image bytes for the Database backend. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return value
      .slice(1, -1)
      .split(',')
      .filter(Boolean)
      .map(Number);
  },
});

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('en'),
  anonymousRead: boolean('anonymous_read').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('reader'),
    status: userStatusEnum('status').notNull().default('active'),
    mustResetPassword: boolean('must_reset_password').notNull().default(false),
    displayName: text('display_name'),
    themePreference: text('theme_preference'),
    localePreference: text('locale_preference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index().on(t.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index().on(t.userId),
    expiresIdx: index().on(t.expiresAt),
  }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    slug: text('slug').notNull(),
    path: text('path').notNull(),
    locale: text('locale').notNull().default('en'),
    title: text('title').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    // Note: these are conceptually FKs to page_revisions.id. Drizzle table
    // declarations are evaluated eagerly, so we omit the DB-level FK in the
    // MVP slice and enforce the invariant in application code.
    currentPublishedVersionId: uuid('current_published_version_id'),
    latestVersionId: uuid('latest_version_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    canonical: uniqueIndex().on(t.spaceId, t.path, t.locale),
    spaceIdx: index().on(t.spaceId),
    publishedListIdx: index().on(t.spaceId, t.currentPublishedVersionId).where(isNull(t.deletedAt)),
  }),
);

export const pageRevisions = pgTable(
  'page_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id),
    versionNumber: integer('version_number').notNull(),
    locale: text('locale').notNull().default('en'),
    contentType: contentTypeEnum('content_type').notNull().default('text/markdown'),
    // Nullable since 003: the Database backend keeps markdown here, while
    // Local/S3 backends store it externally keyed by revision id.
    contentSource: text('content_source'),
    contentHtml: text('content_html').notNull(),
    contentHash: text('content_hash').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    status: revisionStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: uniqueIndex().on(t.pageId, t.versionNumber),
    pageStatusCreatedIdx: index().on(t.pageId, t.status, t.createdAt),
    hashIdx: index().on(t.contentHash),
  }),
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    scopes: apiKeyScopeEnum('scopes').array().notNull(),
    keyPrefix: text('key_prefix').notNull().unique(),
    keySecretEncrypted: text('key_secret_encrypted').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userRevokedIdx: index().on(t.userId, t.revokedAt),
    userIdx: index().on(t.userId),
  }),
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const apiAuditEntries = pgTable(
  'api_audit_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keyId: uuid('key_id').references(() => apiKeys.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    authStatus: text('auth_status').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index().on(t.userId, t.createdAt),
    createdAtIdx: index().on(t.createdAt),
    keyCreatedIdx: index().on(t.keyId, t.createdAt),
    statusCodeIdx: index().on(t.statusCode),
  }),
);

export const apiAuditEntriesRelations = relations(apiAuditEntries, ({ one }) => ({
  key: one(apiKeys, { fields: [apiAuditEntries.keyId], references: [apiKeys.id] }),
  user: one(users, { fields: [apiAuditEntries.userId], references: [users.id] }),
}));

// ---- Content storage (003) -------------------------------------------------

export const storageBackends = pgTable(
  'storage_backends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: storageBackendTypeEnum('type').notNull(),
    purpose: storageBackendPurposeEnum('purpose').notNull().default('primary'),
    isActive: boolean('is_active').notNull().default(false),
    replicaState: storageReplicaStateEnum('replica_state').notNull().default('disabled'),
    isReadPreferred: boolean('is_read_preferred').notNull().default(false),
    syncStartedAt: timestamp('sync_started_at', { withTimezone: true }),
    syncCompletedAt: timestamp('sync_completed_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    config: jsonb('config').notNull().default({}),
    secretEncrypted: text('secret_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    readPreferredUnique: uniqueIndex('storage_backends_read_preferred')
      .on(t.isReadPreferred)
      .where(sql`${t.isReadPreferred} = true`),
    // Each backend is configured at most once.
    typePurposeUnique: uniqueIndex('storage_backends_type_purpose').on(t.type, t.purpose),
  }),
);

export const storageReplicationTasks = pgTable(
  'storage_replication_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    backendId: uuid('backend_id')
      .notNull()
      .references(() => storageBackends.id, { onDelete: 'cascade' }),
    objectKind: storageObjectKindEnum('object_kind').notNull(),
    objectId: uuid('object_id').notNull(),
    operation: storageReplicationOperationEnum('operation').notNull().default('upsert'),
    expectedHash: text('expected_hash'),
    status: storageReplicationStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    deliveryUnique: uniqueIndex('storage_replication_tasks_delivery').on(
      t.backendId,
      t.objectKind,
      t.objectId,
      t.operation,
    ),
    pendingIdx: index().on(t.status, t.availableAt),
    backendIdx: index().on(t.backendId, t.status),
  }),
);

export const contentAssets = pgTable(
  'content_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: contentAssetKindEnum('kind').notNull().default('image'),
    contentHash: text('content_hash').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    hashIdx: index().on(t.contentHash),
    deletedIdx: index().on(t.deletedAt),
    createdByIdx: index().on(t.createdBy),
  }),
);

export const contentAssetRefs = pgTable(
  'content_asset_refs',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => contentAssets.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => pageRevisions.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('content_asset_refs_pk').on(t.assetId, t.revisionId),
    revisionIdx: index().on(t.revisionId),
  }),
);

export const contentBlobs = pgTable('content_blobs', {
  assetId: uuid('asset_id')
    .primaryKey()
    .references(() => contentAssets.id, { onDelete: 'cascade' }),
  bytes: bytea('bytes').notNull(),
});

export const contentMigrations = pgTable(
  'content_migrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceBackendId: uuid('source_backend_id')
      .notNull()
      .references(() => storageBackends.id),
    targetBackendId: uuid('target_backend_id')
      .notNull()
      .references(() => storageBackends.id),
    status: migrationStatusEnum('status').notNull().default('pending'),
    totalItems: integer('total_items').notNull().default(0),
    copiedItems: integer('copied_items').notNull().default(0),
    verifiedItems: integer('verified_items').notNull().default(0),
    errorMessage: text('error_message'),
    abortRequested: boolean('abort_requested').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index().on(t.status),
  }),
);

export const storageCleanupJobs = pgTable(
  'storage_cleanup_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    backendId: uuid('backend_id')
      .notNull()
      .references(() => storageBackends.id),
    status: cleanupStatusEnum('status').notNull().default('pending'),
    totalItems: integer('total_items').notNull().default(0),
    deletedItems: integer('deleted_items').notNull().default(0),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    backendIdx: index().on(t.backendId),
    statusIdx: index().on(t.status),
  }),
);

export const contentAssetRefsRelations = relations(contentAssetRefs, ({ one }) => ({
  asset: one(contentAssets, {
    fields: [contentAssetRefs.assetId],
    references: [contentAssets.id],
  }),
  revision: one(pageRevisions, {
    fields: [contentAssetRefs.revisionId],
    references: [pageRevisions.id],
  }),
}));

// ---- Content transfer (005) -----------------------------------------------

export const transferSources = pgTable(
  'transfer_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: transferSourceTypeEnum('type').notNull().default('wikijs'),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    allowPrivateNetwork: boolean('allow_private_network').notNull().default(false),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    status: transferSourceStatusEnum('status').notNull().default('unverified'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('transfer_sources_name_unique').on(t.name),
    typeStatusIdx: index('transfer_sources_type_status_idx').on(t.type, t.status),
  }),
);

export const transferArtifacts = pgTable(
  'transfer_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: transferArtifactKindEnum('kind').notNull(),
    status: transferArtifactStatusEnum('status').notNull().default('uploading'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    runId: uuid('run_id'),
    originalFilename: text('original_filename'),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    contentHash: text('content_hash'),
    errorMessage: text('error_message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    statusExpiryIdx: index('transfer_artifacts_status_expiry_idx').on(t.status, t.expiresAt),
    runIdx: index('transfer_artifacts_run_idx').on(t.runId),
    hashIdx: index('transfer_artifacts_hash_idx').on(t.contentHash),
  }),
);

export const transferRuns = pgTable(
  'transfer_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: transferRunKindEnum('kind').notNull(),
    status: transferRunStatusEnum('status').notNull().default('queued'),
    phase: transferRunPhaseEnum('phase').notNull().default('queued'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    sourceId: uuid('source_id').references(() => transferSources.id, { onDelete: 'set null' }),
    sourceArtifactId: uuid('source_artifact_id'),
    previewRunId: uuid('preview_run_id'),
    activeMutationSlot: boolean('active_mutation_slot'),
    options: jsonb('options').notNull().default({}),
    sourceFingerprint: text('source_fingerprint'),
    totalItems: integer('total_items').notNull().default(0),
    processedItems: integer('processed_items').notNull().default(0),
    createdItems: integer('created_items').notNull().default(0),
    replacedItems: integer('replaced_items').notNull().default(0),
    skippedItems: integer('skipped_items').notNull().default(0),
    convertedItems: integer('converted_items').notNull().default(0),
    warningItems: integer('warning_items').notNull().default(0),
    failedItems: integer('failed_items').notNull().default(0),
    currentItem: text('current_item'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetail: text('error_detail'),
    reportArtifactId: uuid('report_artifact_id'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    statusQueuedIdx: index('transfer_runs_status_queued_idx').on(t.status, t.queuedAt),
    kindQueuedIdx: index('transfer_runs_kind_queued_idx').on(t.kind, t.queuedAt),
    sourceQueuedIdx: index('transfer_runs_source_queued_idx').on(t.sourceId, t.queuedAt),
    activeMutationUnique: uniqueIndex('transfer_runs_active_mutation_unique')
      .on(t.activeMutationSlot)
      .where(sql`${t.activeMutationSlot} = true`),
  }),
);

export const transferItems = pgTable(
  'transfer_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => transferRuns.id, { onDelete: 'cascade' }),
    kind: transferItemKindEnum('kind').notNull(),
    sourceKey: text('source_key').notNull(),
    sourceFingerprint: text('source_fingerprint'),
    displayName: text('display_name').notNull(),
    targetKey: text('target_key'),
    action: transferItemActionEnum('action').notNull(),
    status: transferItemStatusEnum('status').notNull().default('pending'),
    bytesTotal: integer('bytes_total'),
    bytesProcessed: integer('bytes_processed').notNull().default(0),
    warningCode: text('warning_code'),
    warningMessage: text('warning_message'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex('transfer_items_source_unique').on(t.runId, t.kind, t.sourceKey),
    pendingIdx: index('transfer_items_pending_idx').on(t.runId, t.status, t.availableAt),
    actionIdx: index('transfer_items_action_idx').on(t.runId, t.action),
  }),
);

export const transferPageMappings = pgTable(
  'transfer_page_mappings',
  {
    sourceType: text('source_type').notNull(),
    sourceIdentity: text('source_identity').notNull(),
    sourcePageKey: text('source_page_key').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    targetPageId: uuid('target_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    targetPath: text('target_path').notNull(),
    targetLocale: text('target_locale').notNull(),
    lastRunId: uuid('last_run_id')
      .notNull()
      .references(() => transferRuns.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex('transfer_page_mappings_source_unique').on(
      t.sourceType,
      t.sourceIdentity,
      t.sourcePageKey,
    ),
    targetIdx: index('transfer_page_mappings_target_idx').on(t.targetPageId),
  }),
);

export const transferAssetMappings = pgTable(
  'transfer_asset_mappings',
  {
    sourceType: text('source_type').notNull(),
    sourceIdentity: text('source_identity').notNull(),
    sourceAssetKey: text('source_asset_key').notNull(),
    sourceFingerprint: text('source_fingerprint'),
    targetAssetId: uuid('target_asset_id')
      .notNull()
      .references(() => contentAssets.id, { onDelete: 'cascade' }),
    lastRunId: uuid('last_run_id')
      .notNull()
      .references(() => transferRuns.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex('transfer_asset_mappings_source_unique').on(
      t.sourceType,
      t.sourceIdentity,
      t.sourceAssetKey,
    ),
    fingerprintIdx: index('transfer_asset_mappings_fingerprint_idx').on(t.sourceFingerprint),
    targetIdx: index('transfer_asset_mappings_target_idx').on(t.targetAssetId),
  }),
);

// ---- Appearance & Site Configuration (006) --------------------------------

/** Single-row, site-wide identity & footer settings (id always 'default'). */
export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey().default('default'),
  siteName: text('site_name').notNull().default('next-wiki'),
  footerCopyright: text('footer_copyright'),
  icpNumber: text('icp_number'),
  icpUrl: text('icp_url'),
  publicSecurityNumber: text('public_security_number'),
  publicSecurityUrl: text('public_security_url'),
  iconData: bytea('icon_data'),
  iconMime: text('icon_mime'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row pointer to the active admin-authored system theme (always id
 * 'default'). The actual CSS lives in `system_themes`; this row holds the
 * active pointer so the layout can resolve the current CSS in one query. */
export const systemThemeSettings = pgTable('system_theme_settings', {
  id: text('id').primaryKey().default('default'),
  activeThemeId: uuid('active_theme_id').references(() => systemThemes.id, {
    onDelete: 'set null',
  }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Shared list of system themes (admin-managed). Built-in themes are seeded
 * with `is_builtin = true` and are read-only. Admins copy a built-in into a
 * custom row, edit it, and activate it. The active row is stored on
 * `system_theme_settings.active_theme_id`. */
export const systemThemes = pgTable(
  'system_themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    css: text('css').notNull().default(''),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex('system_themes_name_idx').on(t.name),
  }),
);

/** Per-user reading-theme tokens. Absent row means the user has not customized;
 * the root layout falls back to the static defaults. The user's light/dark mode
 * preference (users.themePreference) selects which color set applies. */
export const userAppearance = pgTable('user_appearance', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lightColors: jsonb('light_colors').notNull(),
  darkColors: jsonb('dark_colors').notNull(),
  fonts: jsonb('fonts').notNull(),
  fontSizes: jsonb('font_sizes').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- System AI (004) ------------------------------------------------------

export const aiSettings = pgTable('ai_settings', {
  id: text('id').primaryKey().default('default'),
  enabled: boolean('enabled').notNull().default(false),
  eventRetentionHours: integer('event_retention_hours').notNull().default(24),
  artifactRetentionHours: integer('artifact_retention_hours').notNull().default(24),
  modelDetectorApiKeyEncrypted: text('model_detector_api_key_encrypted'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiProviders = pgTable(
  'ai_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: aiProviderTypeEnum('type').notNull().default('chat'),
    vendor: aiProviderVendorEnum('vendor').notNull().default('custom'),
    kind: aiProviderKindEnum('kind').notNull(),
    baseUrl: text('base_url').notNull(),
    config: jsonb('config').notNull().default({}),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    status: aiProviderStatusEnum('status').notNull().default('unverified'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('ai_providers_name_unique').on(t.name),
    enabledIdx: index('ai_providers_enabled_idx').on(t.enabled),
  }),
);

export const aiModels = pgTable(
  'ai_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    canonicalId: text('canonical_id'),
    displayName: text('display_name').notNull(),
    availability: aiModelAvailabilityEnum('availability').notNull().default('unknown'),
    contextWindow: integer('context_window'),
    maxOutputTokens: integer('max_output_tokens'),
    embeddingDimensions: integer('embedding_dimensions'),
    inputModalities: text('input_modalities').array().notNull().default([]),
    outputModalities: text('output_modalities').array().notNull().default([]),
    rawMetadata: jsonb('raw_metadata').notNull().default({}),
    manuallyAdded: boolean('manually_added').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerExternalUnique: uniqueIndex('ai_models_provider_external_unique').on(
      t.providerId,
      t.externalId,
    ),
    providerIdx: index('ai_models_provider_idx').on(t.providerId),
    availabilityIdx: index('ai_models_availability_idx').on(t.availability),
  }),
);

export const aiModelCapabilities = pgTable(
  'ai_model_capabilities',
  {
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id, { onDelete: 'cascade' }),
    capability: aiCapabilityEnum('capability').notNull(),
    supported: boolean('supported').notNull(),
    source: aiCapabilitySourceEnum('source').notNull(),
    details: jsonb('details').notNull().default({}),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex('ai_model_capabilities_pk').on(t.modelId, t.capability, t.source),
  }),
);

export const aiPurposeAssignments = pgTable('ai_purpose_assignments', {
  purpose: aiPurposeEnum('purpose').primaryKey(),
  modelId: uuid('model_id')
    .notNull()
    .references(() => aiModels.id),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userAiEntitlements = pgTable('user_ai_entitlements', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  questionAnsweringEnabled: boolean('question_answering_enabled').notNull().default(false),
  textOptimizationEnabled: boolean('text_optimization_enabled').notNull().default(false),
  imageGenerationEnabled: boolean('image_generation_enabled').notNull().default(false),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiIndexGenerations = pgTable(
  'ai_index_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id),
    embeddingDimensions: integer('embedding_dimensions').notNull(),
    chunkerVersion: text('chunker_version').notNull(),
    status: aiIndexStatusEnum('status').notNull().default('building'),
    isActive: boolean('is_active').notNull().default(false),
    totalPages: integer('total_pages').notNull().default(0),
    completedPages: integer('completed_pages').notNull().default(0),
    failedPages: integer('failed_pages').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeUnique: uniqueIndex('ai_index_generations_active_unique')
      .on(t.isActive)
      .where(sql`${t.isActive} = true`),
    statusIdx: index('ai_index_generations_status_idx').on(t.status),
  }),
);

export const aiPageIndexStates = pgTable(
  'ai_page_index_states',
  {
    generationId: uuid('generation_id')
      .notNull()
      .references(() => aiIndexGenerations.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    targetRevisionId: uuid('target_revision_id').references(() => pageRevisions.id),
    targetContentHash: text('target_content_hash'),
    status: aiPageIndexStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    pk: uniqueIndex('ai_page_index_states_pk').on(t.generationId, t.pageId),
    pendingIdx: index('ai_page_index_states_pending_idx').on(t.status, t.availableAt),
  }),
);

export const aiKnowledgeChunks = pgTable(
  'ai_knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => aiIndexGenerations.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => pageRevisions.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    headingPath: text('heading_path').array().notNull().default([]),
    contentText: text('content_text').notNull(),
    contentHash: text('content_hash').notNull(),
    byteCount: integer('byte_count').notNull(),
    embedding: vector('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    revisionChunkUnique: uniqueIndex('ai_knowledge_chunks_revision_unique').on(
      t.generationId,
      t.revisionId,
      t.chunkIndex,
    ),
    generationPageIdx: index('ai_knowledge_chunks_generation_page_idx').on(
      t.generationId,
      t.pageId,
    ),
    generationRevisionIdx: index('ai_knowledge_chunks_generation_revision_idx').on(
      t.generationId,
      t.revisionId,
    ),
  }),
);

export const aiActions = pgTable(
  'ai_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feature: aiActionFeatureEnum('feature').notNull(),
    status: aiActionStatusEnum('status').notNull().default('queued'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    providerId: uuid('provider_id').references(() => aiProviders.id),
    modelId: uuid('model_id').references(() => aiModels.id),
    indexGenerationId: uuid('index_generation_id').references(() => aiIndexGenerations.id),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    questionMode: aiQuestionModeEnum('question_mode'),
    requestMetadata: jsonb('request_metadata').notNull().default({}),
    resultMetadata: jsonb('result_metadata').notNull().default({}),
    usageMetadata: jsonb('usage_metadata').notNull().default({}),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetail: text('error_detail'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    actorQueuedIdx: index('ai_actions_actor_queued_idx').on(t.actorUserId, t.queuedAt),
    statusQueuedIdx: index('ai_actions_status_queued_idx').on(t.status, t.queuedAt),
    providerQueuedIdx: index('ai_actions_provider_queued_idx').on(t.providerId, t.queuedAt),
  }),
);

export const aiActionInputs = pgTable('ai_action_inputs', {
  actionId: uuid('action_id')
    .primaryKey()
    .references(() => aiActions.id, { onDelete: 'cascade' }),
  payloadEncrypted: text('payload_encrypted').notNull(),
  payloadHash: text('payload_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const aiActionEvents = pgTable(
  'ai_action_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actionId: uuid('action_id')
      .notNull()
      .references(() => aiActions.id, { onDelete: 'cascade' }),
    type: aiEventTypeEnum('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    actionCursorIdx: index('ai_action_events_action_cursor_idx').on(t.actionId, t.id),
  }),
);

export const aiGeneratedArtifacts = pgTable(
  'ai_generated_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actionId: uuid('action_id')
      .notNull()
      .references(() => aiActions.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    contentHash: text('content_hash').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    bytes: bytea('bytes').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    promotedAssetId: uuid('promoted_asset_id').references(() => contentAssets.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
  },
  (t) => ({
    actionUnique: uniqueIndex('ai_generated_artifacts_action_unique').on(t.actionId),
    expiresIdx: index('ai_generated_artifacts_expires_idx').on(t.expiresAt),
  }),
);
