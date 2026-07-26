import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './index';
import {
  skillFileKindEnum,
  skillFileOperationEnum,
  skillSourceEnum,
  skillValidationStateEnum,
} from './enums';

/**
 * Agent Skills schema (028).
 *
 * Rows exist ONLY for admin-authored skills and for overrides of built-in
 * skills. Directory-sourced skills deliberately have no row: they are derived
 * from the read-only mount on every scan, so removing a package from the host
 * removes it from the catalogue without leaving orphaned state behind.
 *
 * A skill is instructions, not authority. Nothing here grants a permission or
 * changes review policy; skill content reaches the model as prompt text and
 * acts only through the already-governed tool runtime (026).
 */

/** An admin-authored skill, or the override of a built-in skill's shipped
 * content. `source` is never `directory`. */
export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    source: skillSourceEnum('source').notNull(),
    description: text('description').notNull(),
    validationState: skillValidationStateEnum('validation_state').notNull().default('valid'),
    validationError: text('validation_error'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Names are unique across every source (FR-014). This index is the
    // backstop; the registry produces the message naming the conflicting
    // source before a write is attempted.
    nameUnique: uniqueIndex('skills_name_unique')
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
    sourceIdx: index('skills_source_idx').on(t.source),
    nameFormat: check('skills_name_format', sql`${t.name} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // `directory` skills are derived, never stored.
    sourceStored: check('skills_source_stored', sql`${t.source} <> 'directory'`),
  }),
);

/** Current content of every file in a persisted skill. */
export const skillFiles = pgTable(
  'skill_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** Relative to the package root. Validated before any storage access. */
    path: text('path').notNull(),
    kind: skillFileKindEnum('kind').notNull(),
    content: text('content').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    /** Optimistic-concurrency token. A write carries the revision it read; a
     * mismatch is rejected rather than silently overwriting (FR-036). */
    revision: integer('revision').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillPathUnique: uniqueIndex('skill_files_skill_path_unique').on(t.skillId, t.path),
    revisionPositive: check('skill_files_revision_positive', sql`${t.revision} > 0`),
  }),
);

/** Immutable per-save history. Never updated or deleted by normal operations. */
export const skillFileRevisions = pgTable(
  'skill_file_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** Recorded even when the file is later deleted. */
    path: text('path').notNull(),
    revision: integer('revision').notNull(),
    content: text('content').notNull(),
    operation: skillFileOperationEnum('operation').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillPathRevisionUnique: uniqueIndex('skill_file_revisions_unique').on(
      t.skillId,
      t.path,
      t.revision,
    ),
    skillCreatedIdx: index('skill_file_revisions_skill_created_idx').on(t.skillId, t.createdAt),
  }),
);

/**
 * Per-skill administrator state, keyed by skill NAME rather than row id so it
 * survives a directory skill temporarily disappearing from the mount and coming
 * back. A missing row means "use the source default" — which keeps the default
 * changeable in code without a data migration.
 */
export const skillSettings = pgTable('skill_settings', {
  name: text('name').primaryKey(),
  enabled: boolean('enabled').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skillsRelations = relations(skills, ({ many }) => ({
  files: many(skillFiles),
  revisions: many(skillFileRevisions),
}));

export const skillFilesRelations = relations(skillFiles, ({ one }) => ({
  skill: one(skills, { fields: [skillFiles.skillId], references: [skills.id] }),
}));

export const skillFileRevisionsRelations = relations(skillFileRevisions, ({ one }) => ({
  skill: one(skills, { fields: [skillFileRevisions.skillId], references: [skills.id] }),
}));
