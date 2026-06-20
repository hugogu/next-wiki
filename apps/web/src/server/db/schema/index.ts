import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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
  storageBackendTypeEnum,
  userRoleEnum,
  userStatusEnum,
} from './enums';

/** PostgreSQL `bytea` column carrying raw image bytes for the Database backend. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
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
    config: jsonb('config').notNull().default({}),
    secretEncrypted: text('secret_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most one active primary backend.
    activePrimaryUnique: uniqueIndex('storage_backends_active_primary')
      .on(t.purpose)
      .where(sql`${t.isActive} = true and ${t.purpose} = 'primary'`),
    // Each backend is configured at most once.
    typePurposeUnique: uniqueIndex('storage_backends_type_purpose').on(t.type, t.purpose),
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
