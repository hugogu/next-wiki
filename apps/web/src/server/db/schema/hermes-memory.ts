import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  hermesMemoryCaptureStatusEnum,
  hermesMemoryEvidenceRelationEnum,
  hermesMemoryNamespaceStateEnum,
  hermesMemoryRecordStateEnum,
  hermesMemoryRecordTypeEnum,
} from './enums';
import { apiKeys, pageRevisions, pages, users } from './index';

export const hermesMemoryNamespaces = pgTable(
  'hermes_memory_namespaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    state: hermesMemoryNamespaceStateEnum('state').notNull().default('active'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCreated: index('hermes_memory_namespaces_owner_created_idx').on(table.ownerUserId, table.createdAt),
  }),
);

export const hermesMemoryKeyBindings = pgTable(
  'hermes_memory_key_bindings',
  {
    apiKeyId: uuid('api_key_id').primaryKey().references(() => apiKeys.id, { onDelete: 'cascade' }),
    namespaceId: uuid('namespace_id').notNull().references(() => hermesMemoryNamespaces.id, { onDelete: 'restrict' }),
    sharedByOwner: boolean('shared_by_owner').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespace: index('hermes_memory_key_bindings_namespace_idx').on(table.namespaceId),
  }),
);

export const hermesMemoryRecords = pgTable(
  'hermes_memory_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespaceId: uuid('namespace_id').notNull().references(() => hermesMemoryNamespaces.id, { onDelete: 'restrict' }),
    recordType: hermesMemoryRecordTypeEnum('record_type').notNull(),
    pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'restrict' }),
    currentRevisionId: uuid('current_revision_id').notNull().references(() => pageRevisions.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceSessionDigest: text('source_session_digest'),
    state: hermesMemoryRecordStateEnum('state').notNull().default('active'),
    forgottenAt: timestamp('forgotten_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespaceIdempotency: uniqueIndex('hermes_memory_records_namespace_idempotency_unique').on(table.namespaceId, table.idempotencyKey),
    namespaceStateUpdated: index('hermes_memory_records_namespace_state_updated_idx').on(table.namespaceId, table.state, table.updatedAt),
    page: uniqueIndex('hermes_memory_records_page_unique').on(table.pageId),
  }),
);

export const hermesMemoryEvidenceLinks = pgTable(
  'hermes_memory_evidence_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryRecordId: uuid('memory_record_id').notNull().references(() => hermesMemoryRecords.id, { onDelete: 'restrict' }),
    evidenceRecordId: uuid('evidence_record_id').notNull().references(() => hermesMemoryRecords.id, { onDelete: 'restrict' }),
    relation: hermesMemoryEvidenceRelationEnum('relation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memoryEvidenceUnique: uniqueIndex('hermes_memory_evidence_links_unique').on(table.memoryRecordId, table.evidenceRecordId, table.relation),
    evidence: index('hermes_memory_evidence_links_evidence_idx').on(table.evidenceRecordId),
  }),
);

/** Durable capture state without retaining a second copy of evidence content. */
export const hermesMemoryCaptures = pgTable(
  'hermes_memory_captures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespaceId: uuid('namespace_id').notNull().references(() => hermesMemoryNamespaces.id, { onDelete: 'restrict' }),
    apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    sessionDigest: text('session_digest').notNull(),
    checkpoint: boolean('checkpoint').notNull().default(false),
    status: hermesMemoryCaptureStatusEnum('status').notNull().default('queued'),
    evidenceRecordId: uuid('evidence_record_id').references(() => hermesMemoryRecords.id, { onDelete: 'restrict' }),
    jobId: text('job_id'),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespaceIdempotency: uniqueIndex('hermes_memory_captures_namespace_idempotency_unique').on(table.namespaceId, table.idempotencyKey),
    apiKey: index('hermes_memory_captures_api_key_idx').on(table.apiKeyId),
    statusUpdated: index('hermes_memory_captures_status_updated_idx').on(table.status, table.updatedAt),
  }),
);

export const hermesMemoryNamespacesRelations = relations(hermesMemoryNamespaces, ({ one, many }) => ({
  owner: one(users, { fields: [hermesMemoryNamespaces.ownerUserId], references: [users.id] }),
  keyBindings: many(hermesMemoryKeyBindings),
  records: many(hermesMemoryRecords),
  captures: many(hermesMemoryCaptures),
}));

export const hermesMemoryKeyBindingsRelations = relations(hermesMemoryKeyBindings, ({ one }) => ({
  key: one(apiKeys, { fields: [hermesMemoryKeyBindings.apiKeyId], references: [apiKeys.id] }),
  namespace: one(hermesMemoryNamespaces, {
    fields: [hermesMemoryKeyBindings.namespaceId],
    references: [hermesMemoryNamespaces.id],
  }),
}));

export const hermesMemoryRecordsRelations = relations(hermesMemoryRecords, ({ one, many }) => ({
  namespace: one(hermesMemoryNamespaces, {
    fields: [hermesMemoryRecords.namespaceId],
    references: [hermesMemoryNamespaces.id],
  }),
  page: one(pages, { fields: [hermesMemoryRecords.pageId], references: [pages.id] }),
  revision: one(pageRevisions, {
    fields: [hermesMemoryRecords.currentRevisionId],
    references: [pageRevisions.id],
  }),
  evidenceFor: many(hermesMemoryEvidenceLinks, { relationName: 'memory_record' }),
  evidenceLinks: many(hermesMemoryEvidenceLinks, { relationName: 'evidence_record' }),
}));

export const hermesMemoryEvidenceLinksRelations = relations(hermesMemoryEvidenceLinks, ({ one }) => ({
  memory: one(hermesMemoryRecords, {
    fields: [hermesMemoryEvidenceLinks.memoryRecordId],
    references: [hermesMemoryRecords.id],
    relationName: 'memory_record',
  }),
  evidence: one(hermesMemoryRecords, {
    fields: [hermesMemoryEvidenceLinks.evidenceRecordId],
    references: [hermesMemoryRecords.id],
    relationName: 'evidence_record',
  }),
}));

export const hermesMemoryCapturesRelations = relations(hermesMemoryCaptures, ({ one }) => ({
  namespace: one(hermesMemoryNamespaces, {
    fields: [hermesMemoryCaptures.namespaceId],
    references: [hermesMemoryNamespaces.id],
  }),
  evidenceRecord: one(hermesMemoryRecords, {
    fields: [hermesMemoryCaptures.evidenceRecordId],
    references: [hermesMemoryRecords.id],
  }),
}));
