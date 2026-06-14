import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import {
  contentTypeEnum,
  revisionStatusEnum,
  userRoleEnum,
  userStatusEnum,
} from './enums';

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('en'),
  anonymousRead: boolean('anonymous_read').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('reader'),
  status: userStatusEnum('status').notNull().default('active'),
  mustResetPassword: boolean('must_reset_password').notNull().default(false),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    contentSource: text('content_source').notNull(),
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
