import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// tsvector is not built into drizzle-orm/pg-core — define it as a custom type.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// spaces
// ---------------------------------------------------------------------------

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  defaultLocale: text("default_locale").notNull().default("en"),
  isPublicByDefault: boolean("is_public_by_default").notNull().default(false),
  // enum: tree | flat
  navigationMode: text("navigation_mode").notNull().default("tree"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// translation_groups
// ---------------------------------------------------------------------------

export const translationGroups = pgTable("translation_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    translationGroupId: uuid("translation_group_id").references(() => translationGroups.id),
    path: text("path").notNull(),
    locale: text("locale").notNull().default("en"),
    title: text("title").notNull(),
    summary: text("summary"),
    // enum: draft | published | archived | deleted
    status: text("status").notNull().default("draft"),
    // Set after first revision is created; circular ref resolved at app layer
    currentRevisionId: uuid("current_revision_id"),
    searchVector: tsvector("search_vector"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.spaceId, t.path, t.locale)],
);

// ---------------------------------------------------------------------------
// page_revisions  (immutable once created)
// ---------------------------------------------------------------------------

export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    sourceFormat: text("source_format").notNull().default("markdown"),
    sourceContent: text("source_content").notNull(),
    contentHash: text("content_hash").notNull(),
    changeSummary: text("change_summary"),
    authoredByUserId: uuid("authored_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.pageId, t.revisionNumber)],
);

// ---------------------------------------------------------------------------
// page_links
// ---------------------------------------------------------------------------

export const pageLinks = pgTable("page_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourcePageId: uuid("source_page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  sourceRevisionId: uuid("source_revision_id")
    .notNull()
    .references(() => pageRevisions.id, { onDelete: "cascade" }),
  targetSpaceKey: text("target_space_key").notNull(),
  targetPath: text("target_path").notNull(),
  targetLocale: text("target_locale"),
  linkText: text("link_text"),
  // enum: valid | broken | redirected | unknown
  status: text("status").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// page_redirects
// ---------------------------------------------------------------------------

export const pageRedirects = pgTable(
  "page_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.spaceId, t.fromPath)],
);

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  colorToken: text("color_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// page_tags
// ---------------------------------------------------------------------------

export const pageTags = pgTable(
  "page_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.pageId, t.tagId)],
);

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  // enum: local | object
  storageKind: text("storage_kind").notNull().default("local"),
  path: text("path").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  // enum: image | document | diagram-source | theme-asset | other
  kind: text("kind").notNull().default("other"),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// asset_references
// ---------------------------------------------------------------------------

export const assetReferences = pgTable("asset_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  // enum: page | theme
  ownerType: text("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  // enum: inline | attachment | diagram-source | logo | favicon
  referenceRole: text("reference_role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// permission_rules
// ---------------------------------------------------------------------------

export const permissionRules = pgTable("permission_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // enum: user | group
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  // enum: site | space | page | asset | ai | integration
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"), // null = applies to all resources of that type
  // enum: read | write | delete | manage | execute
  action: text("action").notNull(),
  // enum: allow | deny
  effect: text("effect").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  // enum: draft | active | archived
  status: text("status").notNull().default("draft"),
  // enum: system | custom
  origin: text("origin").notNull().default("custom"),
  tokenSet: jsonb("token_set").notNull().default({}),
  chromeConfig: jsonb("chrome_config").notNull().default({}),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const spacesRelations = relations(spaces, ({ many }) => ({
  pages: many(pages),
  redirects: many(pageRedirects),
}));

export const translationGroupsRelations = relations(translationGroups, ({ many }) => ({
  pages: many(pages),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  space: one(spaces, {
    fields: [pages.spaceId],
    references: [spaces.id],
  }),
  translationGroup: one(translationGroups, {
    fields: [pages.translationGroupId],
    references: [translationGroups.id],
  }),
  createdByUser: one(users, {
    fields: [pages.createdByUserId],
    references: [users.id],
    relationName: "pageCreator",
  }),
  updatedByUser: one(users, {
    fields: [pages.updatedByUserId],
    references: [users.id],
    relationName: "pageUpdater",
  }),
  revisions: many(pageRevisions),
  outboundLinks: many(pageLinks, { relationName: "sourceLinks" }),
  tags: many(pageTags),
}));

export const pageRevisionsRelations = relations(pageRevisions, ({ one, many }) => ({
  page: one(pages, {
    fields: [pageRevisions.pageId],
    references: [pages.id],
  }),
  authoredByUser: one(users, {
    fields: [pageRevisions.authoredByUserId],
    references: [users.id],
  }),
  outboundLinks: many(pageLinks, { relationName: "revisionLinks" }),
}));

export const pageLinksRelations = relations(pageLinks, ({ one }) => ({
  sourcePage: one(pages, {
    fields: [pageLinks.sourcePageId],
    references: [pages.id],
    relationName: "sourceLinks",
  }),
  sourceRevision: one(pageRevisions, {
    fields: [pageLinks.sourceRevisionId],
    references: [pageRevisions.id],
    relationName: "revisionLinks",
  }),
}));

export const pageRedirectsRelations = relations(pageRedirects, ({ one }) => ({
  space: one(spaces, {
    fields: [pageRedirects.spaceId],
    references: [spaces.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  pageTags: many(pageTags),
}));

export const pageTagsRelations = relations(pageTags, ({ one }) => ({
  page: one(pages, {
    fields: [pageTags.pageId],
    references: [pages.id],
  }),
  tag: one(tags, {
    fields: [pageTags.tagId],
    references: [tags.id],
  }),
  assignedByUser: one(users, {
    fields: [pageTags.assignedByUserId],
    references: [users.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [assets.uploadedByUserId],
    references: [users.id],
  }),
  references: many(assetReferences),
}));

export const assetReferencesRelations = relations(assetReferences, ({ one }) => ({
  asset: one(assets, {
    fields: [assetReferences.assetId],
    references: [assets.id],
  }),
}));

export const themesRelations = relations(themes, ({ one }) => ({
  createdByUser: one(users, {
    fields: [themes.createdByUserId],
    references: [users.id],
  }),
}));
