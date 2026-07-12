import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  bigserial,
  check,
  customType,
  date,
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
  searchBehaviorActionEnum,
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
  tagMutationKindEnum,
  tagMutationStatusEnum,
  translationRunKindEnum,
  translationRunStatusEnum,
  translationItemStatusEnum,
  translationFreshnessStatusEnum,
  translationUsageSourceEnum,
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
    // 015: translation linkage. Both null for a source/original page; both set
    // for a translated page, where source_page_id equals the group's source.
    // FK to translation_groups omitted here (declared later, eager evaluation);
    // the invariant is enforced in application code and by the partial unique.
    translationGroupId: uuid('translation_group_id'),
    sourcePageId: uuid('source_page_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    canonical: uniqueIndex().on(t.spaceId, t.path, t.locale),
    spaceIdx: index().on(t.spaceId),
    publishedListIdx: index().on(t.spaceId, t.currentPublishedVersionId).where(isNull(t.deletedAt)),
    // At most one translated page per (group, locale). Source pages have a null
    // group and are excluded from this constraint.
    translationGroupLocaleUnique: uniqueIndex('pages_translation_group_locale_unique')
      .on(t.translationGroupId, t.locale)
      .where(sql`${t.translationGroupId} is not null`),
    sourcePageIdx: index('pages_source_page_idx').on(t.sourcePageId),
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

// ---- Page tags and typed Markdown metadata (014) ------------------------

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id').notNull().references(() => spaces.id),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    activeNameUnique: uniqueIndex().on(t.spaceId, t.normalizedName).where(isNull(t.deletedAt)),
    spaceIdx: index().on(t.spaceId, t.deletedAt),
  }),
);

export const pageRevisionMetadata = pgTable('page_revision_metadata', {
  revisionId: uuid('revision_id').primaryKey().references(() => pageRevisions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  date: date('metadata_date'),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pageRevisionTags = pgTable(
  'page_revision_tags',
  {
    revisionId: uuid('revision_id').notNull().references(() => pageRevisions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
    tagName: text('tag_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
  },
  (t) => ({
    identity: uniqueIndex().on(t.revisionId, t.tagId),
    tagIdx: index().on(t.tagId),
  }),
);

export const tagMutations = pgTable(
  'tag_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
    targetTagId: uuid('target_tag_id').references(() => tags.id),
    kind: tagMutationKindEnum('kind').notNull(),
    status: tagMutationStatusEnum('status').notNull().default('queued'),
    requestedName: text('requested_name'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    affectedPageCount: integer('affected_page_count'),
    failure: text('failure'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    tagStatusIdx: index().on(t.tagId, t.status),
    requesterIdx: index().on(t.requestedBy, t.createdAt),
  }),
);

export const tagsRelations = relations(tags, ({ many }) => ({
  revisionTags: many(pageRevisionTags),
  mutations: many(tagMutations),
}));

export const pageRevisionMetadataRelations = relations(pageRevisionMetadata, ({ one }) => ({
  revision: one(pageRevisions, { fields: [pageRevisionMetadata.revisionId], references: [pageRevisions.id] }),
}));

export const pageRevisionTagsRelations = relations(pageRevisionTags, ({ one }) => ({
  revision: one(pageRevisions, { fields: [pageRevisionTags.revisionId], references: [pageRevisions.id] }),
  tag: one(tags, { fields: [pageRevisionTags.tagId], references: [tags.id] }),
}));

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
    entryType: text('entry_type').notNull().default('api'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    authStatus: text('auth_status').notNull(),
    errorMessage: text('error_message'),
    // Source IP of the request, parsed from x-forwarded-for / x-real-ip.
    // Nullable so historical rows and requests without a proxy header stay valid.
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index().on(t.userId, t.createdAt),
    createdAtIdx: index().on(t.createdAt),
    keyCreatedIdx: index().on(t.keyId, t.createdAt),
    statusCodeIdx: index().on(t.statusCode),
    entryTypeCreatedIdx: index().on(t.entryType, t.createdAt),
  }),
);

export const apiAuditEntriesRelations = relations(apiAuditEntries, ({ one }) => ({
  key: one(apiKeys, { fields: [apiAuditEntries.keyId], references: [apiKeys.id] }),
  user: one(users, { fields: [apiAuditEntries.userId], references: [users.id] }),
}));

// ---- Header hybrid search (013) -------------------------------------------

export const searchRecords = pgTable(
  'search_records',
  {
    id: uuid('id').primaryKey(),
    spaceId: uuid('space_id').notNull().references(() => spaces.id),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').notNull(),
    query: text('query').notNull(),
    keywordResultCount: integer('keyword_result_count').notNull().default(0),
    semanticResultCount: integer('semantic_result_count').notNull().default(0),
    resultCount: integer('result_count').notNull().default(0),
    semanticState: text('semantic_state').notNull().default('skipped'),
    // Correlation key for the semantic-search action. Drizzle does not attach a
    // DB-level FK here because ai_actions is declared later in this module.
    semanticActionId: uuid('semantic_action_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionCreatedIdx: index().on(t.sessionId, t.createdAt),
    actorCreatedIdx: index().on(t.actorUserId, t.createdAt),
    spaceCreatedIdx: index().on(t.spaceId, t.createdAt),
    createdIdx: index().on(t.createdAt),
  }),
);

export const searchBehaviors = pgTable(
  'search_behaviors',
  {
    id: uuid('id').primaryKey(),
    searchRecordId: uuid('search_record_id').notNull().references(() => searchRecords.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: searchBehaviorActionEnum('action').notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionPageShape: check(
      'search_behaviors_action_page_shape',
      sql`(${t.action} = 'result_open' AND ${t.pageId} IS NOT NULL) OR (${t.action} = 'escape' AND ${t.pageId} IS NULL)`,
    ),
    recordCreatedIdx: index().on(t.searchRecordId, t.createdAt),
    actorCreatedIdx: index().on(t.actorUserId, t.createdAt),
    actionCreatedIdx: index().on(t.action, t.createdAt),
    pageCreatedIdx: index().on(t.pageId, t.createdAt),
  }),
);

export const searchSettings = pgTable(
  'search_settings',
  {
    id: text('id').primaryKey().default('default'),
    semanticSearchEnabled: boolean('semantic_search_enabled').notNull().default(true),
    minRelevanceScore: integer('min_relevance_score').notNull().default(0),
    showExcerpts: boolean('show_excerpts').notNull().default(true),
    excerptLength: integer('excerpt_length').notNull().default(120),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('search_settings_singleton_id', sql`${t.id} = 'default'`),
    relevanceRange: check('search_settings_min_relevance_score_range', sql`${t.minRelevanceScore} >= -100 and ${t.minRelevanceScore} <= 100`),
    excerptLengthRange: check('search_settings_excerpt_length_range', sql`${t.excerptLength} >= 20 and ${t.excerptLength} <= 500`),
  }),
);

export const searchRecordsRelations = relations(searchRecords, ({ one, many }) => ({
  space: one(spaces, { fields: [searchRecords.spaceId], references: [spaces.id] }),
  actor: one(users, { fields: [searchRecords.actorUserId], references: [users.id] }),
  behaviors: many(searchBehaviors),
}));

export const searchBehaviorsRelations = relations(searchBehaviors, ({ one }) => ({
  record: one(searchRecords, { fields: [searchBehaviors.searchRecordId], references: [searchRecords.id] }),
  actor: one(users, { fields: [searchBehaviors.actorUserId], references: [users.id] }),
  page: one(pages, { fields: [searchBehaviors.pageId], references: [pages.id] }),
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
    pauseRequested: boolean('pause_requested').notNull().default(false),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetail: text('error_detail'),
    reportArtifactId: uuid('report_artifact_id'),
    cleanedAt: timestamp('cleaned_at', { withTimezone: true }),
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

// ---- AI page translation (015) --------------------------------------------

/** One group per source/original page; translated pages link back via
 * `pages.translation_group_id`. Makes parentage explicit so unrelated same-path
 * locale pages are never mistaken for a translation. */
export const translationGroups = pgTable(
  'translation_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .unique()
      .references(() => pages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Immutable, named translation-style templates. Editing a template creates a
 * new version row; used versions are never mutated. */
export const translationPromptTemplates = pgTable(
  'translation_prompt_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const translationPromptVersions = pgTable(
  'translation_prompt_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => translationPromptTemplates.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    body: text('body').notNull(),
    contentHash: text('content_hash').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templateVersionUnique: uniqueIndex('translation_prompt_versions_unique').on(
      t.templateId,
      t.versionNumber,
    ),
  }),
);

/** Administrator-managed target-language configuration keyed by a normalized
 * lowercase ISO 639-1 code. A retired/disabled language cannot start new work
 * and its language-prefixed reader URLs resolve as unavailable. */
export const translationLanguages = pgTable('translation_languages', {
  code: text('code').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  defaultPromptVersionId: uuid('default_prompt_version_id').references(
    () => translationPromptVersions.id,
    { onDelete: 'set null' },
  ),
  defaultModelId: uuid('default_model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Durable work for exactly one target language. Frozen inputs make a displayed
 * translation reproducible after model/prompt configuration changes. */
export const translationRuns = pgTable(
  'translation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetLocale: text('target_locale').notNull(),
    kind: translationRunKindEnum('kind').notNull().default('initial'),
    status: translationRunStatusEnum('status').notNull().default('queued'),
    predecessorRunId: uuid('predecessor_run_id'),
    triggerRunId: uuid('trigger_run_id'),
    // Frozen inputs (snapshots). model_id may be nulled if a model is later
    // deleted, but the external-id/name snapshots remain for provenance.
    providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
    modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
    modelExternalId: text('model_external_id'),
    modelDisplayName: text('model_display_name'),
    promptVersionId: uuid('prompt_version_id').references(() => translationPromptVersions.id, {
      onDelete: 'set null',
    }),
    promptContentHash: text('prompt_content_hash'),
    scopeSnapshot: jsonb('scope_snapshot').notNull().default({}),
    // Control
    pauseRequested: boolean('pause_requested').notNull().default(false),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    // Holds the target locale while this run is the active mutator of that
    // language; null otherwise. A plain unique index (multiple nulls allowed)
    // enforces at most one active run per language.
    activeLanguageSlot: text('active_language_slot'),
    // Progress
    totalItems: integer('total_items').notNull().default(0),
    processedItems: integer('processed_items').notNull().default(0),
    completedItems: integer('completed_items').notNull().default(0),
    skippedItems: integer('skipped_items').notNull().default(0),
    failedItems: integer('failed_items').notNull().default(0),
    supersededItems: integer('superseded_items').notNull().default(0),
    currentItem: text('current_item'),
    // Analytics
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedTokens: integer('cached_tokens'),
    usageSource: translationUsageSourceEnum('usage_source').notNull().default('unavailable'),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    // Audit
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetail: text('error_detail'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    localeQueuedIdx: index('translation_runs_locale_queued_idx').on(t.targetLocale, t.queuedAt),
    statusQueuedIdx: index('translation_runs_status_queued_idx').on(t.status, t.queuedAt),
    actorQueuedIdx: index('translation_runs_actor_queued_idx').on(t.actorUserId, t.queuedAt),
    modelQueuedIdx: index('translation_runs_model_queued_idx').on(t.modelId, t.queuedAt),
    activeLanguageUnique: uniqueIndex('translation_runs_active_language_unique').on(
      t.activeLanguageSlot,
    ),
  }),
);

/** One durable item per source page per run. */
export const translationRunItems = pgTable(
  'translation_run_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => translationRuns.id, { onDelete: 'cascade' }),
    // Source snapshot
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').references(() => pageRevisions.id, {
      onDelete: 'set null',
    }),
    sourceContentHash: text('source_content_hash'),
    // Target (null until success)
    translationPageId: uuid('translation_page_id').references(() => pages.id, {
      onDelete: 'set null',
    }),
    translationRevisionId: uuid('translation_revision_id').references(() => pageRevisions.id, {
      onDelete: 'set null',
    }),
    targetLocale: text('target_locale').notNull(),
    targetPath: text('target_path'),
    // Lifecycle
    status: translationItemStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    retryAvailable: boolean('retry_available').notNull().default(false),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // Frozen provenance refs
    providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
    modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
    promptVersionId: uuid('prompt_version_id').references(() => translationPromptVersions.id, {
      onDelete: 'set null',
    }),
    // Usage
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedTokens: integer('cached_tokens'),
    usageSource: translationUsageSourceEnum('usage_source').notNull().default('unavailable'),
    providerRequestId: text('provider_request_id'),
    durationMs: integer('duration_ms'),
    // Diagnostics (bounded, sanitized; never source body/credentials/raw body)
    warningCode: text('warning_code'),
    warningMessage: text('warning_message'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUnique: uniqueIndex('translation_run_items_source_unique').on(t.runId, t.sourcePageId),
    pendingIdx: index('translation_run_items_pending_idx').on(t.runId, t.status, t.availableAt),
    sourcePageIdx: index('translation_run_items_source_page_idx').on(t.sourcePageId),
  }),
);

/** One immutable row per generated translated page_revisions row, mapping it to
 * the exact source revision, run item, model, and prompt version (P8). */
export const translationRevisionProvenance = pgTable('translation_revision_provenance', {
  translationRevisionId: uuid('translation_revision_id')
    .primaryKey()
    .references(() => pageRevisions.id, { onDelete: 'cascade' }),
  sourceRevisionId: uuid('source_revision_id').references(() => pageRevisions.id, {
    onDelete: 'set null',
  }),
  runId: uuid('run_id').references(() => translationRuns.id, { onDelete: 'set null' }),
  itemId: uuid('item_id').references(() => translationRunItems.id, { onDelete: 'set null' }),
  providerId: uuid('provider_id').references(() => aiProviders.id, { onDelete: 'set null' }),
  modelId: uuid('model_id').references(() => aiModels.id, { onDelete: 'set null' }),
  modelExternalId: text('model_external_id'),
  modelDisplayName: text('model_display_name'),
  promptVersionId: uuid('prompt_version_id').references(() => translationPromptVersions.id, {
    onDelete: 'set null',
  }),
  promptContentHash: text('prompt_content_hash'),
  providerRequestId: text('provider_request_id'),
  outputHash: text('output_hash'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cachedTokens: integer('cached_tokens'),
  usageSource: translationUsageSourceEnum('usage_source').notNull().default('unavailable'),
  durationMs: integer('duration_ms'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One reader/admin freshness projection per translated page. Ordinary page
 * revisions and provenance remain the historical source of truth. */
export const pageTranslationStates = pgTable(
  'page_translation_states',
  {
    translationPageId: uuid('translation_page_id')
      .primaryKey()
      .references(() => pages.id, { onDelete: 'cascade' }),
    sourcePageId: uuid('source_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    translationGroupId: uuid('translation_group_id')
      .notNull()
      .references(() => translationGroups.id, { onDelete: 'cascade' }),
    targetLocale: text('target_locale').notNull(),
    freshnessStatus: translationFreshnessStatusEnum('freshness_status').notNull().default('stale'),
    latestSourceRevisionId: uuid('latest_source_revision_id').references(() => pageRevisions.id, {
      onDelete: 'set null',
    }),
    latestSourceHash: text('latest_source_hash'),
    translatedSourceRevisionId: uuid('translated_source_revision_id').references(
      () => pageRevisions.id,
      { onDelete: 'set null' },
    ),
    translatedSourceHash: text('translated_source_hash'),
    currentTranslatedRevisionId: uuid('current_translated_revision_id').references(
      () => pageRevisions.id,
      { onDelete: 'set null' },
    ),
    latestRunId: uuid('latest_run_id').references(() => translationRuns.id, {
      onDelete: 'set null',
    }),
    latestItemId: uuid('latest_item_id').references(() => translationRunItems.id, {
      onDelete: 'set null',
    }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceLocaleIdx: index('page_translation_states_source_locale_idx').on(
      t.sourcePageId,
      t.targetLocale,
    ),
    freshnessIdx: index('page_translation_states_freshness_idx').on(t.freshnessStatus),
    groupIdx: index('page_translation_states_group_idx').on(t.translationGroupId),
  }),
);
