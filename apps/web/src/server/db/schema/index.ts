import { relations, sql } from 'drizzle-orm';
import {
  bigint,
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
  migrationStatusEnum,
  crossSpaceMigrationStatusEnum,
  crossSpaceMigrationItemStatusEnum,
  revisionStatusEnum,
  storageBackendPurposeEnum,
  storageObjectKindEnum,
  storageReplicaStateEnum,
  storageReplicationOperationEnum,
  storageReplicationStatusEnum,
  storageBackendTypeEnum,
  userRoleEnum,
  userStatusEnum,
  aiAnswerLanguageEnum,
  aiProviderKindEnum,
  aiProviderTypeEnum,
  aiProviderVendorEnum,
  aiProviderStatusEnum,
  aiModelAvailabilityEnum,
  aiCapabilityEnum,
  aiCapabilitySourceEnum,
  toolCallStrategyEnum,
  integrationAuthModeEnum,
  integrationKindEnum,
  staticSiteAuthModeEnum,
  staticSiteProviderEnum,
  staticSitePublicationStatusEnum,
  staticSitePublicationTriggerEnum,
  aiPurposeEnum,
  aiIndexStatusEnum,
  aiPageIndexStatusEnum,
  aiActionFeatureEnum,
  aiActionStatusEnum,
  scheduledAiJobStatusEnum,
  scheduledAiJobRunStatusEnum,
  scheduledAiJobTriggerEnum,
  aiQuestionModeEnum,
  webResearchProviderEnum,
  webResearchSourceStatusEnum,
  webResearchAttemptKindEnum,
  webResearchAttemptOutcomeEnum,
  aiEventTypeEnum,
  searchBehaviorActionEnum,
  searchCapabilityIdEnum,
  searchEngineRunStateEnum,
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
  auditOriginEnum,
  feishuConnectionModeEnum,
  feishuBindingStatusEnum,
  feishuInboxStatusEnum,
  feishuSessionStateEnum,
  feishuNotificationEventTypeEnum,
  feishuSubscriptionModeEnum,
  feishuSubscriptionStatusEnum,
  feishuDeliveryStatusEnum,
  setupAccountStatusEnum,
  setupAiStatusEnum,
  setupSamplePagesStatusEnum,
  setupStepEnum,
  writingModeEnum,
  spaceKindEnum,
  pageKindEnum,
  actorKindEnum,
  contentNatureEnum,
  pageVisibilityEnum,
  rawConversationCaptureStatusEnum,
  analyticsProviderEnum,
  pageAddressKindEnum,
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
    return value.slice(1, -1).split(',').filter(Boolean).map(Number);
  },
});

export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    // 032: stable slugs remain service identifiers. The reader uses this
    // administrator-managed, non-empty first path segment instead.
    routePrefix: text('route_prefix'),
    // Nullable only for rows created before 032. The spaces service supplies a
    // safe built-in default until an administrator saves the configuration.
    defaultVisibility: pageVisibilityEnum('default_visibility'),
    defaultLocale: text('default_locale').notNull().default('en'),
    anonymousRead: boolean('anonymous_read').notNull().default(true),
    kind: spaceKindEnum('kind').notNull().default('wiki'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    routePrefixUnique: uniqueIndex('spaces_route_prefix_unique')
      .on(t.routePrefix)
      .where(sql`${t.routePrefix} is not null`),
  }),
);

/** Previous public prefixes. Aliases are redirect inputs, never canonical roots. */
export const spaceRouteAliases = pgTable(
  'space_route_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    prefix: text('prefix').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prefixUnique: uniqueIndex('space_route_aliases_prefix_unique').on(t.prefix),
    spaceIdx: index('space_route_aliases_space_idx').on(t.spaceId),
  }),
);

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
    // Per-user opt-in for external web research. This is separate from the
    // admin-managed AI entitlement and connector availability.
    webResearchPreference: boolean('web_research_preference').notNull().default(false),
    // Set whenever a session is established (password login, first-run setup).
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete marker: set when an admin removes the account. Deleted users
    // are hidden from management lists and cannot authenticate, but their rows
    // (and thus their authorship/audit references) are preserved.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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

// ---- Raw space taxonomy (022 Phase 11) -------------------------------------

/** Admin-managed taxonomy filing every raw entry under exactly one immutable
 * category. `is_default` (at most one) is applied silently when a raw create
 * omits an explicit category. Categories are retired rather than deleted while
 * entries still reference them. */
export const rawCategories = pgTable(
  'raw_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    isRetired: boolean('is_retired').notNull().default(false),
    // 023: non-null for built-in, protected categories (e.g. 'conversation').
    // Stable filing/renderer-dispatch key, independent of the admin-editable
    // name/slug. Never set by the admin category API.
    systemKey: text('system_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    slugUnique: uniqueIndex('raw_categories_slug_unique').on(t.slug),
    nameUnique: uniqueIndex('raw_categories_name_unique').on(t.name),
    // At most one default category across the taxonomy.
    singleDefault: uniqueIndex('raw_categories_single_default')
      .on(t.isDefault)
      .where(sql`${t.isDefault} = true`),
    systemKeyUnique: uniqueIndex('raw_categories_system_key_unique')
      .on(t.systemKey)
      .where(sql`${t.systemKey} is not null`),
  }),
);

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    // 035: the page's canonical public address, space-scoped and prefix-free
    // (e.g. "getting-started/install"). Independent of `path`, which stays the
    // organizational tree location. Empty for translation rows, which resolve
    // as `{locale}/{source.slug}` instead of owning an address of their own.
    // Soft-deleted rows keep their slug — see `pages_space_slug_unique` below.
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
    // 022: `link` pages render another page's published content at this path.
    // Conceptually a FK to pages.id; app-enforced like
    // current_published_version_id (see note above).
    kind: pageKindEnum('kind').notNull().default('native'),
    linkTargetPageId: uuid('link_target_page_id'),
    nature: contentNatureEnum('nature').notNull().default('original'),
    visibility: pageVisibilityEnum('visibility').notNull().default('public'),
    // 022 (Phase 11): every raw entry is filed under exactly one immutable
    // admin-managed category. Nullable at the DB layer (non-raw pages are
    // legitimately NULL); the NOT NULL rule for raw is service-enforced.
    rawCategoryId: uuid('raw_category_id').references(() => rawCategories.id, {
      onDelete: 'restrict',
    }),
    // Per-page authoring preference: when true, supported metadata (date,
    // summary, tags) is also embedded as a `---` frontmatter block in the
    // Markdown body; when false it is kept only in the structured projection.
    // Persisted so the editor and admin properties dialogs agree instead of
    // re-guessing from content shape on each edit.
    writeMetadataToFrontmatter: boolean('write_metadata_to_frontmatter').notNull().default(false),
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
    linkTargetPageIdx: index('pages_link_target_page_idx').on(t.linkTargetPageId),
    linkKindTargetPair: check(
      'pages_link_kind_target_pair',
      sql`(${t.kind} = 'link') = (${t.linkTargetPageId} is not null)`,
    ),
    // 035: a page's canonical address is unique within its space. Excludes
    // translation rows (they own no independent address) but deliberately
    // includes soft-deleted rows, so a deleted page keeps its address until an
    // administrator explicitly releases it (FR-014a).
    spaceSlugUnique: uniqueIndex('pages_space_slug_unique')
      .on(t.spaceId, t.slug)
      .where(sql`${t.translationGroupId} is null`),
  }),
);

/**
 * 035: every public address of a page that is not its canonical slug —
 * retained automatically when a published page's slug (or space) changes, or
 * added manually by an owner. Always points at the page itself, never at
 * another address, so a rename chain can never form (a resolver always
 * arrives at the current canonical slug in a single hop). Superseded
 * `page_route_redirects`, which this table's rows absorbed on migration.
 */
export const pageAddresses = pgTable(
  'page_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    // Space-scoped, prefix-free, no leading separator. May carry a leading
    // locale segment when it addresses a translation row.
    address: text('address').notNull(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'restrict' }),
    kind: pageAddressKindEnum('kind').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    spaceAddressUnique: uniqueIndex('page_addresses_space_address_unique').on(t.spaceId, t.address),
    pageIdx: index('page_addresses_page_idx').on(t.pageId),
  }),
);

/** Durable preview and execution record for a page or folder migration. */
export const crossSpaceMigrations = pgTable(
  'cross_space_migrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestedBy: uuid('requested_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    sourceSpaceId: uuid('source_space_id').notNull().references(() => spaces.id, { onDelete: 'restrict' }),
    destinationSpaceId: uuid('destination_space_id').notNull().references(() => spaces.id, { onDelete: 'restrict' }),
    selectionKind: text('selection_kind').notNull(),
    selectionPath: text('selection_path'),
    selectionPageId: uuid('selection_page_id').references(() => pages.id, { onDelete: 'set null' }),
    destinationPathPrefix: text('destination_path_prefix'),
    visibility: pageVisibilityEnum('visibility'),
    adaptOkf: boolean('adapt_okf').notNull().default(true),
    fingerprint: text('fingerprint').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    status: crossSpaceMigrationStatusEnum('status').notNull().default('previewed'),
    warningCount: integer('warning_count').notNull().default(0),
    failure: text('failure'),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('cross_space_migrations_status_idx').on(t.status, t.createdAt),
    requesterIdx: index('cross_space_migrations_requester_idx').on(t.requestedBy, t.createdAt),
    previewExpiryIdx: index('cross_space_migrations_preview_expiry_idx').on(t.expiresAt),
  }),
);

/** One ordered, independently claimable page movement within an operation. */
export const crossSpaceMigrationItems = pgTable(
  'cross_space_migration_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    migrationId: uuid('migration_id').notNull().references(() => crossSpaceMigrations.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
    sourcePath: text('source_path').notNull(),
    destinationPath: text('destination_path').notNull(),
    locale: text('locale').notNull(),
    status: crossSpaceMigrationItemStatusEnum('status').notNull().default('pending'),
    warning: text('warning'),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    migrationOrdinalUnique: uniqueIndex('cross_space_migration_items_migration_ordinal_unique').on(t.migrationId, t.ordinal),
    migrationStatusIdx: index('cross_space_migration_items_migration_status_idx').on(t.migrationId, t.status, t.ordinal),
    pageIdx: index('cross_space_migration_items_page_idx').on(t.pageId),
  }),
);

/** Private audit trail for historical link pages retired by the 032 transition. */
export const retiredLinkPages = pgTable(
  'retired_link_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkPageId: uuid('link_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'restrict' }),
    legacyPath: text('legacy_path').notNull(),
    targetPageId: uuid('target_page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'restrict' }),
    retiredBy: uuid('retired_by').references(() => users.id, { onDelete: 'set null' }),
    retiredAt: timestamp('retired_at', { withTimezone: true }).notNull().defaultNow(),
    disposition: text('disposition').notNull(),
  },
  (t) => ({
    linkPageUnique: uniqueIndex('retired_link_pages_link_page_unique').on(t.linkPageId),
    legacyPathUnique: uniqueIndex('retired_link_pages_legacy_path_unique').on(t.legacyPath),
    targetIdx: index('retired_link_pages_target_idx').on(t.targetPageId),
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
    // 022 (Phase 11): open MIME-type string (was a `text/markdown` enum). Wiki
    // and generated revisions keep defaulting to markdown; raw revisions carry
    // the original source format. Grammar enforced by the CHECK below.
    contentType: text('content_type').notNull().default('text/markdown'),
    // Nullable since 003: the Database backend keeps markdown here, while
    // Local/S3 backends store it externally keyed by revision id.
    contentSource: text('content_source'),
    contentHtml: text('content_html').notNull(),
    contentHash: text('content_hash').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    status: revisionStatusEnum('status').notNull().default('draft'),
    // 022: derived from the credential at write time (session=human;
    // api_key/pipeline=machine).
    actorKind: actorKindEnum('actor_kind').notNull().default('human'),
    // 022: immutable raw source metadata for a raw create/append chunk; null
    // for non-raw revisions.
    sourceMetadata: jsonb('source_metadata'),
    // 022: immutable link target recorded on link create/retarget revisions.
    // Conceptually a FK to pages.id; app-enforced (see pages note above).
    linkTargetPageId: uuid('link_target_page_id'),
    // 022 (Phase 11): dual-track raw storage. The extracted text lives in
    // content_source (default surface for search/AI); the original bytes are
    // stored through content_assets and referenced here immutably. Null for
    // non-raw revisions and raw revisions whose body is already plain text.
    originalAssetId: uuid('original_asset_id').references(() => contentAssets.id, {
      onDelete: 'restrict',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Soft-delete: never the current published or latest revision (enforced in
    // the service layer, see revisions.ts `remove`), so a deleted revision is
    // always a superseded, non-live historical entry.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: uniqueIndex().on(t.pageId, t.versionNumber),
    pageStatusCreatedIdx: index().on(t.pageId, t.status, t.createdAt),
    hashIdx: index().on(t.contentHash),
    originalAssetIdx: index('page_revisions_original_asset_idx').on(t.originalAssetId),
    // RFC 2046 grammar: type "/" subtype (structured "+" suffix allowed).
    // Parameters (";" …) are stripped by the service layer before storage, so
    // the stored value is always a bare type/subtype.
    contentTypeGrammar: check(
      'page_revisions_content_type_grammar',
      sql`${t.contentType} ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$'`,
    ),
  }),
);

// ---- Wiki writing modes (022) ----------------------------------------------

/** Single-row writing-mode setting (id always 'default'), mirroring the
 * setup_progress singleton pattern. */
export const writingModeSettings = pgTable(
  'writing_mode_settings',
  {
    id: text('id').primaryKey().default('default'),
    mode: writingModeEnum('mode').notNull().default('copilot'),
    // Non-null only while an async mode switch is pending/running; the pair
    // flips to null together when the switch completes (paired-null CHECK).
    pendingMode: writingModeEnum('pending_mode'),
    switchJobId: uuid('switch_job_id'),
    // Inputs required to resume an accepted switch after a process dies between
    // recording the pending state and enqueueing its pg-boss job.
    switchOptions: jsonb('switch_options').$type<{
      rawVisibility: 'public' | 'registered' | 'restricted';
      generatedVisibility: 'public' | 'registered' | 'restricted';
    } | null>(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('writing_mode_settings_singleton_id', sql`${t.id} = 'default'`),
    switchPair: check(
      'writing_mode_settings_switch_pair',
      sql`(${t.pendingMode} is null) = (${t.switchJobId} is null)`,
    ),
  }),
);

// ---- Page tags and typed Markdown metadata (014) ------------------------

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
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
  revisionId: uuid('revision_id')
    .primaryKey()
    .references(() => pageRevisions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  date: date('metadata_date'),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pageRevisionTags = pgTable(
  'page_revision_tags',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => pageRevisions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
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
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
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
  revision: one(pageRevisions, {
    fields: [pageRevisionMetadata.revisionId],
    references: [pageRevisions.id],
  }),
}));

export const pageRevisionTagsRelations = relations(pageRevisionTags, ({ one }) => ({
  revision: one(pageRevisions, {
    fields: [pageRevisionTags.revisionId],
    references: [pageRevisions.id],
  }),
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
    // 046: independent from `scopes` (action capabilities) — which content
    // spaces (wiki/raw/generated) this key may read. 'wiki' is always
    // implicitly allowed regardless of this list; see spaceAllowedForKey().
    spaceAccess: spaceKindEnum('space_access').array().notNull().default(['wiki']),
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
    // Source channel of the request (019). Existing rows default to `web`; the
    // audit writer sets this explicitly rather than inferring it from the path.
    origin: auditOriginEnum('origin').notNull().default('web'),
    // Non-secret Feishu event/message/action correlation. Never a raw prompt,
    // answer, secret, or Feishu identity — only a bounded trace value.
    externalCorrelationId: text('external_correlation_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    authStatus: text('auth_status').notNull(),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'),
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
    originCreatedIdx: index().on(t.origin, t.createdAt),
    externalCorrelationIdx: index().on(t.externalCorrelationId),
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
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
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
    // Capability set accepted when the attempt was created (017). Later
    // administrator setting changes never alter an in-flight attempt.
    capabilitySnapshot: jsonb('capability_snapshot')
      .$type<Record<'full_text' | 'fuzzy' | 'semantic', boolean>>()
      .notNull()
      .default({ full_text: true, fuzzy: true, semantic: true }),
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
    searchRecordId: uuid('search_record_id')
      .notNull()
      .references(() => searchRecords.id, { onDelete: 'cascade' }),
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
    fullTextSearchEnabled: boolean('full_text_search_enabled').notNull().default(true),
    fuzzySearchEnabled: boolean('fuzzy_search_enabled').notNull().default(true),
    immediateSearchTimeoutMs: integer('immediate_search_timeout_ms').notNull().default(400),
    minRelevanceScore: integer('min_relevance_score').notNull().default(0),
    showExcerpts: boolean('show_excerpts').notNull().default(true),
    excerptLength: integer('excerpt_length').notNull().default(120),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('search_settings_singleton_id', sql`${t.id} = 'default'`),
    relevanceRange: check(
      'search_settings_min_relevance_score_range',
      sql`${t.minRelevanceScore} >= -100 and ${t.minRelevanceScore} <= 100`,
    ),
    excerptLengthRange: check(
      'search_settings_excerpt_length_range',
      sql`${t.excerptLength} >= 20 and ${t.excerptLength} <= 500`,
    ),
    immediateTimeoutRange: check(
      'search_settings_immediate_timeout_range',
      sql`${t.immediateSearchTimeoutMs} >= 100 and ${t.immediateSearchTimeoutMs} <= 2000`,
    ),
    // Semantic retrieval can never become the only way to search the wiki.
    lexicalPathRequired: check(
      'search_settings_lexical_path_required',
      sql`${t.fullTextSearchEnabled} or ${t.fuzzySearchEnabled}`,
    ),
  }),
);

// One row per stable capability within one accepted search attempt (017).
// Persists only safe lifecycle state, aggregate count, timing, and an opaque
// continuation reference — never candidates, excerpts, scores, or diagnostics.
export const searchEngineRuns = pgTable(
  'search_engine_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    searchRecordId: uuid('search_record_id')
      .notNull()
      .references(() => searchRecords.id, { onDelete: 'cascade' }),
    capabilityId: searchCapabilityIdEnum('capability_id').notNull(),
    state: searchEngineRunStateEnum('state').notNull().default('pending'),
    resultCount: integer('result_count').notNull().default(0),
    continuationRef: text('continuation_ref'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recordCapabilityUnique: uniqueIndex('search_engine_runs_record_capability_unique').on(
      t.searchRecordId,
      t.capabilityId,
    ),
    resultCountNonNegative: check(
      'search_engine_runs_result_count_nonnegative',
      sql`${t.resultCount} >= 0`,
    ),
    stateUpdatedIdx: index().on(t.state, t.updatedAt),
    recordUpdatedIdx: index().on(t.searchRecordId, t.updatedAt),
  }),
);

export const searchRecordsRelations = relations(searchRecords, ({ one, many }) => ({
  space: one(spaces, { fields: [searchRecords.spaceId], references: [spaces.id] }),
  actor: one(users, { fields: [searchRecords.actorUserId], references: [users.id] }),
  behaviors: many(searchBehaviors),
  engineRuns: many(searchEngineRuns),
}));

export const searchEngineRunsRelations = relations(searchEngineRuns, ({ one }) => ({
  record: one(searchRecords, {
    fields: [searchEngineRuns.searchRecordId],
    references: [searchRecords.id],
  }),
}));

export const searchBehaviorsRelations = relations(searchBehaviors, ({ one }) => ({
  record: one(searchRecords, {
    fields: [searchBehaviors.searchRecordId],
    references: [searchRecords.id],
  }),
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
    kind: text('kind').notNull().default('image'),
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

/** 034: page-level association between a page and an attached file (asset
 * kind = 'attachment'). Not revision-scoped — unlike content_asset_refs,
 * which is derived by scanning a revision's Markdown for inline image
 * references, an attachment is not embedded in the page body, so it is
 * linked directly to the page instead. */
export const pageAttachments = pgTable(
  'page_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => contentAssets.id, { onDelete: 'restrict' }),
    fileName: text('file_name').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    pageIdx: index('page_attachments_page_idx').on(t.pageId).where(isNull(t.removedAt)),
    assetIdx: index('page_attachments_asset_idx').on(t.assetId),
  }),
);

/** 034: wiki-wide admin-configured attachment limits (singleton row, `id`
 * fixed to 'default', mirroring `site_settings`/`system_theme_settings`).
 * Read only at upload-validation time; changing it never affects
 * already-stored attachments. */
export const attachmentSettings = pgTable('attachment_settings', {
  id: text('id').primaryKey().default('default'),
  maxSizeBytes: integer('max_size_bytes').notNull().default(20 * 1024 * 1024),
  allowedCategories: text('allowed_categories')
    .array()
    .notNull()
    .default(['image', 'video', 'document']),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  // Admin-toggleable public read-only demo mode (see server/permissions
  // isDemoReadOnly()). NEXT_WIKI_DEMO_READONLY only seeds this column's
  // initial value the first time this row is created; this DB value is the
  // sole source of truth afterward.
  demoReadonly: boolean('demo_readonly').notNull().default(false),
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

// ---- Content data sources (023) --------------------------------------------

/** Site-wide, key-addressed registry of Content > Data Sources. Only keys
 * registered in `services/content-data-sources.ts` are read/updated through
 * the service; unknown keys are rejected rather than silently inserted. */
export const contentDataSourceSettings = pgTable('content_data_source_settings', {
  sourceKey: text('source_key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- System AI (004) ------------------------------------------------------

export const aiSettings = pgTable('ai_settings', {
  id: text('id').primaryKey().default('default'),
  enabled: boolean('enabled').notNull().default(false),
  // Whether visitors without an authenticated account may use Wiki AI Q&A.
  // Disabled by default because anonymous prompts consume provider capacity.
  anonymousWikiAiEnabled: boolean('anonymous_wiki_ai_enabled').notNull().default(false),
  // 30 days. The event log is the only record of a conversation that was never
  // captured as a Raw page, so the default keeps chat history readable for a
  // sensible stretch rather than for the streaming session alone.
  eventRetentionHours: integer('event_retention_hours').notNull().default(720),
  artifactRetentionHours: integer('artifact_retention_hours').notNull().default(24),
  // Deprecated compatibility column from early 026 builds. Retrieval now uses
  // search_settings.min_relevance_score across Search, Wiki AI, and bots.
  wikiQuestionMinRelevanceScore: integer('wiki_question_min_relevance_score')
    .notNull()
    .default(500),
  // Each Model Capability Detector is configured independently so switching
  // between them never discards stored credentials. OpenRouter is a global
  // enrichment key (active when present). Cloudflare is a catalog-listing
  // engine, gated by its own enabled flag so saving a token does not silently
  // change how every provider syncs.
  modelDetectorApiKeyEncrypted: text('model_detector_api_key_encrypted'),
  cloudflareDetectorEnabled: boolean('cloudflare_detector_enabled').notNull().default(false),
  cloudflareAccountId: text('cloudflare_account_id'),
  cloudflareApiTokenEncrypted: text('cloudflare_api_token_encrypted'),
  // Optional outbound web-research connector. Its credentials are write-only
  // and encrypted with the same application key as other AI secrets.
  webResearchEnabled: boolean('web_research_enabled').notNull().default(false),
  webResearchProvider: webResearchProviderEnum('web_research_provider'),
  webResearchApiKeyEncrypted: text('web_research_api_key_encrypted'),
  webResearchAllowedDomains: text('web_research_allowed_domains').array().notNull().default([]),
  webResearchBlockedDomains: text('web_research_blocked_domains').array().notNull().default([]),
  webResearchMaxSearchesPerTurn: integer('web_research_max_searches_per_turn').notNull().default(2),
  webResearchMaxCandidatesPerSearch: integer('web_research_max_candidates_per_search')
    .notNull()
    .default(5),
  webResearchMaxOpenedSourcesPerTurn: integer('web_research_max_opened_sources_per_turn')
    .notNull()
    .default(3),
  webResearchMaxSourceChars: integer('web_research_max_source_chars').notNull().default(16_000),
  webResearchTimeoutMs: integer('web_research_timeout_ms').notNull().default(10_000),
  webResearchLastTestAt: timestamp('web_research_last_test_at', { withTimezone: true }),
  webResearchLastTestStatus: text('web_research_last_test_status'),
  // 026: Wiki AI tool-runtime tuning, admin-editable from Bots > General. These
  // override the hard-coded planner defaults; the per-provider tool policy's
  // max_calls_per_turn still takes precedence over tool_max_calls when set.
  toolMaxCalls: integer('tool_max_calls').notNull().default(100),
  // Characters of one tool result carried into the planner prompt. A read that
  // does not fit returns a pageable window rather than being cut off.
  toolResultMaxChars: integer('tool_result_max_chars')
    .notNull()
    .default(32 * 1024),
  // Planner sampling temperature stored as hundredths (10 = 0.10, range 0-200).
  toolPlannerTemperature: integer('tool_planner_temperature').notNull().default(10),
  // Planner max output tokens; the tool loop always reads a concrete value.
  toolPlannerMaxOutputTokens: integer('tool_planner_max_output_tokens').notNull().default(32_768),
  toolPlannerTimeoutMs: integer('tool_planner_timeout_ms').notNull().default(120_000),
  // Language control for generated answers. The default adds no instruction, so
  // the model answers in whatever language it judges appropriate.
  answerLanguage: aiAnswerLanguageEnum('answer_language').notNull().default('model_default'),
  // Wiki AI runtime prompt overrides, admin-editable from AI > Prompts.
  // Null uses the built-in default prompt. Machine-generated catalogues and
  // planner context are inserted by the runtime even if a custom template
  // omits their placeholder, so an override cannot make tool calls lose their
  // live input contract.
  assistantSystemPrompt: text('assistant_system_prompt'),
  toolSystemPrompt: text('tool_system_prompt'),
  webResearchPolicyPrompt: text('web_research_policy_prompt'),
  plannerUserPrompt: text('planner_user_prompt'),
  toolAnswerPrompt: text('tool_answer_prompt'),
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
    // 028: how tool calls reach this model. `auto` prefers the provider's
    // native function-calling and falls back to the text protocol. This is
    // deliberately separate from the `tool_calling` capability, which answers
    // whether the model may drive the tool loop at all.
    toolCallStrategy: toolCallStrategyEnum('tool_call_strategy').notNull().default('auto'),
    // Set when a native tool payload was rejected at runtime, so the next turn
    // goes straight to the text protocol instead of paying for another failed
    // attempt. Cleared when an admin changes the strategy or the model is
    // re-synced.
    nativeToolCallFailedAt: timestamp('native_tool_call_failed_at', { withTimezone: true }),
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
  webResearchEnabled: boolean('web_research_enabled').notNull().default(false),
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
    // 023: pointer to the canonical Raw Conversation page for a captured
    // `wiki_question` action. Conceptually a FK to pages.id; app-enforced like
    // other cross-module page pointers in this schema (see pages note above).
    rawConversationPageId: uuid('raw_conversation_page_id').references(() => pages.id, {
      onDelete: 'set null',
    }),
    // Highest ai_action_events.id already folded into the latest Raw
    // Conversation revision; drives idempotent/incremental capture.
    rawConversationLastEventId: bigint('raw_conversation_last_event_id', { mode: 'number' })
      .notNull()
      .default(0),
    rawConversationCaptureStatus: rawConversationCaptureStatusEnum(
      'raw_conversation_capture_status',
    )
      .notNull()
      .default('not_applicable'),
    // Bounded diagnostic for operators only; never shown to unauthorized users.
    rawConversationCaptureError: text('raw_conversation_capture_error'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    actorQueuedIdx: index('ai_actions_actor_queued_idx').on(t.actorUserId, t.queuedAt),
    statusQueuedIdx: index('ai_actions_status_queued_idx').on(t.status, t.queuedAt),
    providerQueuedIdx: index('ai_actions_provider_queued_idx').on(t.providerId, t.queuedAt),
    rawConversationPageIdx: index('ai_actions_raw_conversation_page_idx').on(
      t.rawConversationPageId,
    ),
  }),
);

/** Durable administrator-managed definition; child actions may expire, this never does. */
export const scheduledAiJobs = pgTable(
  'scheduled_ai_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    taskDescription: text('task_description').notNull(),
    scheduleCron: text('schedule_cron').notNull(),
    timeZone: text('time_zone').notNull(),
    targetScope: jsonb('target_scope').notNull().default({}),
    runAsUserId: uuid('run_as_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: scheduledAiJobStatusEnum('status').notNull().default('paused'),
    definitionVersion: integer('definition_version').notNull().default(1),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => ({
    normalizedNameUnique: uniqueIndex('scheduled_ai_jobs_normalized_name_unique').on(
      t.normalizedName,
    ),
    dueIdx: index('scheduled_ai_jobs_due_idx')
      .on(t.nextRunAt)
      .where(sql`${t.status} = 'enabled'`),
    ownerIdx: index('scheduled_ai_jobs_owner_idx').on(t.runAsUserId),
    versionCheck: check(
      'scheduled_ai_jobs_definition_version_positive',
      sql`${t.definitionVersion} > 0`,
    ),
  }),
);

/** Permanent occurrence history; actions and workflows are operational links only. */
export const scheduledAiJobRuns = pgTable(
  'scheduled_ai_job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => scheduledAiJobs.id, { onDelete: 'restrict' }),
    trigger: scheduledAiJobTriggerEnum('trigger').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    definitionVersion: integer('definition_version').notNull(),
    definitionSnapshot: jsonb('definition_snapshot').notNull().default({}),
    runAsUserId: uuid('run_as_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: scheduledAiJobRunStatusEnum('status').notNull().default('queued'),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    toolWorkflowId: uuid('tool_workflow_id'),
    resultSummary: jsonb('result_summary').notNull().default({}),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetail: text('error_detail'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    attemptCount: integer('attempt_count').notNull().default(0),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    occurrenceUnique: uniqueIndex('scheduled_ai_job_runs_occurrence_unique')
      .on(t.jobId, t.scheduledFor)
      .where(sql`${t.scheduledFor} is not null`),
    jobQueuedIdx: index('scheduled_ai_job_runs_job_queued_idx').on(t.jobId, t.queuedAt),
    recoveryIdx: index('scheduled_ai_job_runs_recovery_idx').on(t.status, t.queuedAt),
    activeJobUnique: uniqueIndex('scheduled_ai_job_runs_active_job_unique')
      .on(t.jobId)
      .where(sql`${t.status} in ('queued', 'running')`),
    versionCheck: check(
      'scheduled_ai_job_runs_definition_version_positive',
      sql`${t.definitionVersion} > 0`,
    ),
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

/** Ephemeral, action-scoped web evidence. Full content is encrypted and is
 * deleted after 24 hours unless the user explicitly captures it as Raw source
 * material. */
export const aiWebSources = pgTable(
  'ai_web_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aiActionId: uuid('ai_action_id')
      .notNull()
      .references(() => aiActions.id, { onDelete: 'cascade' }),
    originatingToolCallId: uuid('originating_tool_call_id'),
    provider: webResearchProviderEnum('provider').notNull(),
    providerSourceId: text('provider_source_id'),
    canonicalUrl: text('canonical_url').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet'),
    relevanceScore: integer('relevance_score'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
    contentEncrypted: text('content_encrypted'),
    contentHash: text('content_hash'),
    status: webResearchSourceStatusEnum('status').notNull().default('candidate'),
    failureCode: text('failure_code'),
    providerRequestId: text('provider_request_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    capturedRawPageId: uuid('captured_raw_page_id').references(() => pages.id, {
      onDelete: 'set null',
    }),
    capturedRawRevisionId: uuid('captured_raw_revision_id').references(() => pageRevisions.id, {
      onDelete: 'set null',
    }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    capturedBy: uuid('captured_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionIdx: index('ai_web_sources_action_idx').on(t.aiActionId),
    expiresIdx: index('ai_web_sources_expires_idx').on(t.expiresAt),
    actionUrlUnique: uniqueIndex('ai_web_sources_action_url_unique').on(t.aiActionId, t.canonicalUrl),
  }),
);

/** Privacy-safe operational history. It never records a query, URL, body, or
 * credential and outlives an optional conversation/action deletion. */
export const aiWebResearchAttempts = pgTable(
  'ai_web_research_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: webResearchProviderEnum('provider').notNull(),
    kind: webResearchAttemptKindEnum('kind').notNull(),
    outcome: webResearchAttemptOutcomeEnum('outcome').notNull(),
    policyDisposition: text('policy_disposition').notNull(),
    searchCount: integer('search_count').notNull().default(0),
    openCount: integer('open_count').notNull().default(0),
    sourceChars: integer('source_chars').notNull().default(0),
    providerRequestId: text('provider_request_id'),
    latencyMs: integer('latency_ms'),
    creditsUsed: integer('credits_used'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionIdx: index('ai_web_research_attempts_action_idx').on(t.aiActionId),
    createdIdx: index('ai_web_research_attempts_created_idx').on(t.createdAt),
  }),
);

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
    // The source revision/selection is encrypted because selected page text can
    // be sensitive. It lives with the artifact so later promotion/insertion is
    // not coupled to the much shorter AI action-input retention period.
    placementPayloadEncrypted: text('placement_payload_encrypted'),
    placementPayloadHash: text('placement_payload_hash'),
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
export const translationGroups = pgTable('translation_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourcePageId: uuid('source_page_id')
    .notNull()
    .unique()
    .references(() => pages.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Immutable, named translation-style templates. Editing a template creates a
 * new version row; used versions are never mutated. */
export const translationPromptTemplates = pgTable('translation_prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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

/** Feature-wide translation runtime settings (singleton). Kept out of
 * `ai_settings` because the deadline only makes sense for a background,
 * whole-document generation, not for interactive AI calls. */
export const translationSettings = pgTable(
  'translation_settings',
  {
    id: text('id').primaryKey().default('default'),
    // Deadline for one page's model call, covering the entire stream. The
    // default and the range below mirror DEFAULT/MIN/MAX_TRANSLATION_REQUEST_
    // TIMEOUT_SECONDS in @next-wiki/shared — change both together.
    requestTimeoutSeconds: integer('request_timeout_seconds').notNull().default(600),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('translation_settings_singleton_id', sql`${t.id} = 'default'`),
    timeoutRange: check(
      'translation_settings_request_timeout_range',
      sql`${t.requestTimeoutSeconds} >= 30 and ${t.requestTimeoutSeconds} <= 3600`,
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
    // At most one unfinished item may target the same (page, language) across
    // every run, so two runs can never race to publish the same translated
    // page. This is the precise guard a page-scoped run relies on instead of
    // the language-wide slot, which is what lets an administrator translate one
    // page while unrelated work for the same language is still in flight.
    activePageUnique: uniqueIndex('translation_run_items_active_page_unique')
      .on(t.targetLocale, t.sourcePageId)
      .where(sql`${t.status} in ('pending', 'running')`),
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

// ---- Feishu integration (019) ---------------------------------------------

/** Singleton Feishu connection configuration (`id = 'default'`). Secrets are
 * AES-256-GCM ciphertext only; an unconfigured deployment stays usable. */
export const feishuIntegrationConfig = pgTable('feishu_integration_config', {
  id: text('id').primaryKey(),
  appId: text('app_id'),
  appSecretEncrypted: text('app_secret_encrypted'),
  encryptKeyEncrypted: text('encrypt_key_encrypted'),
  verificationTokenEncrypted: text('verification_token_encrypted'),
  enabled: boolean('enabled').notNull().default(false),
  connectionMode: feishuConnectionModeEnum('connection_mode').notNull().default('webhook'),
  userRateLimitPerMinute: integer('user_rate_limit_per_minute').notNull().default(10),
  chatRateLimitPerMinute: integer('chat_rate_limit_per_minute').notNull().default(30),
  notificationRetentionHours: integer('notification_retention_hours').notNull().default(72),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived server-side state for a Feishu QR application-registration flow.
 * The device code is an authorization secret and must never reach the browser. */
export const feishuAppRegistrationSessions = pgTable(
  'feishu_app_registration_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    deviceCodeEncrypted: text('device_code_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorExpiresIdx: index('feishu_app_registration_sessions_creator_expires_idx').on(
      t.createdBy,
      t.expiresAt,
    ),
    expiresIdx: index('feishu_app_registration_sessions_expires_idx').on(t.expiresAt),
  }),
);

/** A confirmed link between a Feishu identity and a Wiki user. */
export const feishuBindings = pgTable(
  'feishu_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    openId: text('open_id').notNull(),
    unionId: text('union_id'),
    displayName: text('display_name'),
    status: feishuBindingStatusEnum('status').notNull().default('active'),
    boundAt: timestamp('bound_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
  },
  (t) => ({
    // At most one active binding per Feishu identity; revoked rows are retained.
    activeOpenIdUnique: uniqueIndex('feishu_bindings_active_open_id')
      .on(t.openId)
      .where(sql`${t.status} = 'active'`),
    userIdx: index('feishu_bindings_user_idx').on(t.userId),
    openIdIdx: index('feishu_bindings_open_id_idx').on(t.openId),
  }),
);

export const feishuBindingsRelations = relations(feishuBindings, ({ one }) => ({
  user: one(users, { fields: [feishuBindings.userId], references: [users.id] }),
}));

/** Single-use, 10-minute binding-confirmation tokens. The raw token is never
 * stored — only its hash. */
export const feishuBindingTokens = pgTable(
  'feishu_binding_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    openId: text('open_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openIdIdx: index('feishu_binding_tokens_open_id_idx').on(t.openId),
    expiresIdx: index('feishu_binding_tokens_expires_idx').on(t.expiresAt),
  }),
);

/** Durable receive-side idempotency record. The unique triple prevents repeat
 * processing across web-app restarts and Feishu at-least-once retries. */
export const feishuInboxEvents = pgTable(
  'feishu_inbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantKey: text('tenant_key').notNull(),
    eventType: text('event_type').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    // Present for message events; enables per-user/per-chat rate accounting.
    openId: text('open_id'),
    chatId: text('chat_id'),
    status: feishuInboxStatusEnum('status').notNull().default('accepted'),
    correlationId: text('correlation_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    dedupeUnique: uniqueIndex('feishu_inbox_events_dedupe').on(
      t.tenantKey,
      t.eventType,
      t.sourceEventId,
    ),
    openRateIdx: index('feishu_inbox_events_open_rate_idx').on(t.openId, t.receivedAt),
    chatRateIdx: index('feishu_inbox_events_chat_rate_idx').on(t.chatId, t.receivedAt),
    expiresIdx: index('feishu_inbox_events_expires_idx').on(t.expiresAt),
  }),
);

/** Per-binding-per-chat conversation session. Never crosses users in a group. */
export const feishuBotSessions = pgTable(
  'feishu_bot_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bindingId: uuid('binding_id')
      .notNull()
      .references(() => feishuBindings.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    state: feishuSessionStateEnum('state').notNull().default('active'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    // At most one active session per (binding, chat).
    activeSessionUnique: uniqueIndex('feishu_bot_sessions_active')
      .on(t.bindingId, t.chatId)
      .where(sql`${t.state} = 'active'`),
    expiresIdx: index('feishu_bot_sessions_expires_idx').on(t.expiresAt),
  }),
);

export const feishuBotSessionsRelations = relations(feishuBotSessions, ({ one }) => ({
  binding: one(feishuBindings, {
    fields: [feishuBotSessions.bindingId],
    references: [feishuBindings.id],
  }),
  action: one(aiActions, { fields: [feishuBotSessions.aiActionId], references: [aiActions.id] }),
}));

/** Administrator-configured notification subscription. Exactly one target shape
 * is valid for the chosen mode (enforced in the service layer). */
export const feishuNotificationSubscriptions = pgTable(
  'feishu_notification_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: feishuNotificationEventTypeEnum('event_type').notNull(),
    mode: feishuSubscriptionModeEnum('mode').notNull(),
    targetOpenId: text('target_open_id'),
    targetChatId: text('target_chat_id'),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    status: feishuSubscriptionStatusEnum('status').notNull().default('active'),
    failureCount: integer('failure_count').notNull().default(0),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventTypeIdx: index('feishu_subscriptions_event_type_idx').on(t.eventType, t.status),
    statusIdx: index('feishu_subscriptions_status_idx').on(t.status),
  }),
);

/** Durable, minimal outbox record for a supported Wiki event. `safePayload`
 * holds only neutral identifiers/status — never pre-rendered private text. */
export const feishuNotificationEvents = pgTable(
  'feishu_notification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: feishuNotificationEventTypeEnum('type').notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'set null' }),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    transferId: uuid('transfer_id').references(() => transferRuns.id, { onDelete: 'set null' }),
    safePayload: jsonb('safe_payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeIdx: index('feishu_notification_events_type_idx').on(t.type, t.occurredAt),
    expiresIdx: index('feishu_notification_events_expires_idx').on(t.expiresAt),
  }),
);

/** One durable outbound Feishu message. The delivery id doubles as the
 * deterministic outgoing request UUID. A delivery is sourced either from a
 * grounded Q&A answer (`ai_action_id`) or from a notification event ×
 * subscription; the resolved send target is denormalized onto the row so the
 * worker can send without extra joins while still re-checking permission via
 * `recipient_binding_id` at delivery time. */
export const feishuNotificationDeliveries = pgTable(
  'feishu_notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Answer source: exactly one answer delivery per completed wiki_question.
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'cascade' }),
    // Notification source: an event fanned out across subscriptions/recipients.
    eventId: uuid('event_id').references(() => feishuNotificationEvents.id, {
      onDelete: 'cascade',
    }),
    subscriptionId: uuid('subscription_id').references(() => feishuNotificationSubscriptions.id, {
      onDelete: 'cascade',
    }),
    recipientBindingId: uuid('recipient_binding_id').references(() => feishuBindings.id, {
      onDelete: 'set null',
    }),
    // Denormalized send target (permission is still re-checked via the binding).
    targetOpenId: text('target_open_id'),
    targetChatId: text('target_chat_id'),
    status: feishuDeliveryStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    claimedBy: text('claimed_by'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastError: text('last_error'),
  },
  (t) => ({
    // One answer delivery per completed Q&A action.
    answerUnique: uniqueIndex('feishu_deliveries_answer_unique')
      .on(t.aiActionId)
      .where(sql`${t.aiActionId} is not null`),
    // Notification per-recipient (direct/private) and per-group (card) forms,
    // each unambiguous under NULLS DISTINCT.
    notifRecipientUnique: uniqueIndex('feishu_deliveries_notif_recipient_unique')
      .on(t.eventId, t.subscriptionId, t.recipientBindingId)
      .where(sql`${t.eventId} is not null and ${t.recipientBindingId} is not null`),
    notifGroupUnique: uniqueIndex('feishu_deliveries_notif_group_unique')
      .on(t.eventId, t.subscriptionId)
      .where(sql`${t.eventId} is not null and ${t.recipientBindingId} is null`),
    dueIdx: index('feishu_deliveries_due_idx').on(t.status, t.availableAt),
    subscriptionIdx: index('feishu_deliveries_subscription_idx').on(t.subscriptionId, t.status),
  }),
);

export const feishuNotificationDeliveriesRelations = relations(
  feishuNotificationDeliveries,
  ({ one }) => ({
    event: one(feishuNotificationEvents, {
      fields: [feishuNotificationDeliveries.eventId],
      references: [feishuNotificationEvents.id],
    }),
    subscription: one(feishuNotificationSubscriptions, {
      fields: [feishuNotificationDeliveries.subscriptionId],
      references: [feishuNotificationSubscriptions.id],
    }),
    recipient: one(feishuBindings, {
      fields: [feishuNotificationDeliveries.recipientBindingId],
      references: [feishuBindings.id],
    }),
  }),
);

// ---- First-run onboarding (021) ----------------------------------------------

/** Single-row first-run onboarding progress (id always 'default'). Records
 * explicit Admin choices (skipped/failed/completed) that cannot be derived
 * from users, AI settings, or pages alone, so interrupted setup can resume and
 * report an accurate final summary. Never stores credentials or page bodies. */
export const setupProgress = pgTable(
  'setup_progress',
  {
    id: text('id').primaryKey().default('default'),
    adminUserId: uuid('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
    accountStatus: setupAccountStatusEnum('account_status').notNull().default('needed'),
    aiStatus: setupAiStatusEnum('ai_status').notNull().default('not_started'),
    samplePagesStatus: setupSamplePagesStatusEnum('sample_pages_status')
      .notNull()
      .default('not_started'),
    currentStep: setupStepEnum('current_step').notNull().default('account'),
    aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
    aiResult: jsonb('ai_result'),
    samplePagesResult: jsonb('sample_pages_result'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('setup_progress_singleton_id', sql`${t.id} = 'default'`),
  }),
);

export const setupProgressRelations = relations(setupProgress, ({ one }) => ({
  adminUser: one(users, {
    fields: [setupProgress.adminUserId],
    references: [users.id],
  }),
  aiAction: one(aiActions, {
    fields: [setupProgress.aiActionId],
    references: [aiActions.id],
  }),
}));

// ---- Web analytics integrations (024) --------------------------------------

/** Key-addressed registry of per-provider analytics configuration. One row
 * per registered provider (see `REGISTERED_ANALYTICS_PROVIDERS` in
 * `services/analytics.ts`). A missing row means "disabled, no Tracking ID". */
export const analyticsProviderSettings = pgTable('analytics_provider_settings', {
  provider: analyticsProviderEnum('provider').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  trackingId: text('tracking_id'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Integrations (031) -----------------------------------------------------
// Credentials for an external service, owned by neither of the features that
// use them. Git export and static site publishing both reach the same GitHub
// account, so they authenticate as that account rather than each holding a
// private copy — a copy would mean two deploy keys to install and two places to
// rotate. Independence between those features is about change coupling, not
// about duplicating shared infrastructure.
//
// One row per kind: the credential identifies an account, and a deployment has
// one account per service.

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: integrationKindEnum('kind').notNull(),
    /** Operator-facing label, e.g. the account or organization name. */
    label: text('label'),
    authMode: integrationAuthModeEnum('auth_mode').notNull(),
    username: text('username'),
    /** Encrypted at rest; never returned by any view and never logged. */
    secretEncrypted: text('secret_encrypted'),
    publicKey: text('public_key'),
    fingerprint: text('fingerprint'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindUnique: uniqueIndex('integrations_kind').on(t.kind),
  }),
);

// ---- Static site publishing (031) -------------------------------------------
// Deliberately NOT a `storage_backends` purpose. That table models where content
// bytes live; a publishing target is never read from. Sharing it would couple
// two independent features through one unique index and force meaningless
// columns (replica_state, is_read_preferred) onto a write-only destination.

/** Where and how the reader-facing static site is published. One row per
 * target; this release supports a single target per deployment. */
export const staticSiteTargets = pgTable('static_site_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  remoteUrl: text('remote_url').notNull(),
  /** Fully owned by this feature: every publish replaces the branch's tree. */
  branch: text('branch').notNull(),
  /** Public address the host serves. Its path component becomes the artifact's
   * base path, which is what makes project-site sub-path hosting work. */
  baseUrl: text('base_url').notNull(),
  /** Which host serves the site. Provider-specific settings live alongside. */
  provider: staticSiteProviderEnum('provider').notNull().default('github_pages'),
  /** Credentials come from the shared integration, not from this row: the
   * account reached is the same one Git export reaches. */
  integrationId: uuid('integration_id').references(() => integrations.id, {
    onDelete: 'restrict',
  }),
  // Superseded by `integration_id`. Retained for one release so the migration
  // can lift existing credentials into the shared integration; dropped in a
  // follow-up once no deployment still reads them.
  authMode: staticSiteAuthModeEnum('auth_mode'),
  username: text('username'),
  secretEncrypted: text('secret_encrypted'),
  publicKey: text('public_key'),
  fingerprint: text('fingerprint'),
  autoPublishOnChange: boolean('auto_publish_on_change').notNull().default(false),
  scheduledPublishEnabled: boolean('scheduled_publish_enabled').notNull().default(false),
  scheduledIntervalMinutes: integer('scheduled_interval_minutes').notNull().default(60),
  /** Set by public-content mutations, cleared on a successful publish. */
  isStale: boolean('is_stale').notNull().default(false),
  /** Most recent run, for cheap status reads. App-enforced reference rather
   * than a FK, matching the `current_published_version_id` convention above —
   * a FK here would be circular with the run's own target_id. */
  lastPublicationId: uuid('last_publication_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One publish attempt. Operational history, not content versioning — this
 * feature creates no revisions. */
export const staticSitePublications = pgTable(
  'static_site_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetId: uuid('target_id')
      .notNull()
      .references(() => staticSiteTargets.id, { onDelete: 'cascade' }),
    status: staticSitePublicationStatusEnum('status').notNull().default('queued'),
    trigger: staticSitePublicationTriggerEnum('trigger').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    pagesPublished: integer('pages_published').notNull().default(0),
    assetsPublished: integer('assets_published').notNull().default(0),
    pagesExcluded: integer('pages_excluded').notNull().default(0),
    /** Counts keyed by exclusion reason. Counts only — a reason with a page
     * attached would turn run history into a disclosure channel for exactly
     * the content the feature exists to keep out of the artifact. */
    exclusionSummary: jsonb('exclusion_summary').notNull().default({}),
    bytesTotal: bigint('bytes_total', { mode: 'number' }).notNull().default(0),
    commitSha: text('commit_sha'),
    forcedPush: boolean('forced_push').notNull().default(false),
    /** Redacted of credential material before storage. */
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTarget: index('static_site_publications_target_created').on(t.targetId, t.createdAt.desc()),
  }),
);

// ---- Wiki AI Tool Runtime (026) --------------------------------------------
// Tool provider/policy/workflow/call/proposal/evidence tables live in their own
// module. Re-exported here (after the tables they reference) so the schema
// barrel and Drizzle relational client see them. The ai-tools module imports
// the base tables above; this trailing re-export keeps that one-directional.
export * from './ai-tools';
export * from './request-logs';

// ---- Agent Skills (028) -----------------------------------------------------
// Skill/override rows, their files, immutable file history, and per-skill admin
// settings. Re-exported after the base tables they reference, same as 026.
export * from './skills';
