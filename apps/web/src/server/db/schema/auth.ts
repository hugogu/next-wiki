import { relations } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(), // nullable — external accounts may have no email
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  // enum: invited | active | suspended
  status: text("status").notNull().default("active"),
  preferredLocale: text("preferred_locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// user_identities
// ---------------------------------------------------------------------------

export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // enum: local | oidc | ldap | saml
    providerType: text("provider_type").notNull(),
    providerKey: text("provider_key").notNull(),
    externalSubject: text("external_subject").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.providerType, t.providerKey, t.externalSubject)],
);

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export const sessions = pgTable("sessions", {
  // Better Auth uses text tokens as session IDs
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

// ---------------------------------------------------------------------------
// auth_providers
// ---------------------------------------------------------------------------

export const authProviders = pgTable("auth_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // enum: oidc | ldap | saml
  providerType: text("provider_type").notNull(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  // enum: disabled | enabled | error
  status: text("status").notNull().default("disabled"),
  config: jsonb("config").notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// group_memberships
// ---------------------------------------------------------------------------

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.groupId)],
);

// ---------------------------------------------------------------------------
// api_tokens
// ---------------------------------------------------------------------------

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopeSet: text("scope_set").array().notNull().default([]),
  // enum: active | revoked
  status: text("status").notNull().default("active"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// site_settings
// ---------------------------------------------------------------------------

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  // enum: string | boolean | integer | json | secret
  valueType: text("value_type").notNull().default("string"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(userIdentities),
  sessions: many(sessions),
  groupMemberships: many(groupMemberships),
  apiTokens: many(apiTokens),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  memberships: many(groupMemberships),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  user: one(users, {
    fields: [groupMemberships.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [groupMemberships.groupId],
    references: [groups.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  createdByUser: one(users, {
    fields: [apiTokens.createdByUserId],
    references: [users.id],
  }),
}));

export const siteSettingsRelations = relations(siteSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [siteSettings.updatedByUserId],
    references: [users.id],
  }),
}));
