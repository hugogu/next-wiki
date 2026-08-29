import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  agentMemoryCaptureKindEnum,
  agentMemoryCaptureStatusEnum,
  agentMemoryConnectionStateEnum,
  agentMemoryContentKindEnum,
  agentMemoryDestinationRoleEnum,
  agentMemoryEvidenceRelationEnum,
  agentMemoryGrantCapabilityEnum,
  agentMemoryGrantStateEnum,
  agentMemoryNamespaceStateEnum,
  agentMemoryOriginEnum,
  agentMemoryRecordStateEnum,
  agentMemoryRecordTypeEnum,
} from './enums';
import { apiKeys, pageRevisions, pages, users } from './index';

export const agentMemoryNamespaces = pgTable(
  'agent_memory_namespaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    /** 040: physical destination role. `shared` alone never grants access — see agentMemoryDestinationGrants. */
    role: agentMemoryDestinationRoleEnum('role').notNull().default('private'),
    state: agentMemoryNamespaceStateEnum('state').notNull().default('active'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCreated: index('agent_memory_namespaces_owner_created_idx').on(table.ownerUserId, table.createdAt),
  }),
);

/** 040: stable, product-neutral identity of an external agent installation. Never adapter input. */
export const agentMemoryConnections = pgTable(
  'agent_memory_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    privateNamespaceId: uuid('private_namespace_id').notNull().unique().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull(),
    displayName: text('display_name').notNull(),
    state: agentMemoryConnectionStateEnum('state').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    ownerCreated: index('agent_memory_connections_owner_created_idx').on(table.ownerUserId, table.createdAt),
  }),
);

export const agentMemoryKeyBindings = pgTable(
  'agent_memory_key_bindings',
  {
    apiKeyId: uuid('api_key_id').primaryKey().references(() => apiKeys.id, { onDelete: 'cascade' }),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    /** 040: nullable only for a 039 legacy binding; every new credential sets this. */
    connectionId: uuid('connection_id').references(() => agentMemoryConnections.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    sharedByOwner: boolean('shared_by_owner').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespace: index('agent_memory_key_bindings_namespace_idx').on(table.namespaceId),
    connection: index('agent_memory_key_bindings_connection_idx').on(table.connectionId),
  }),
);

/** 040: owner-created, revocable read access from a connection to a shared destination. */
export const agentMemoryDestinationGrants = pgTable(
  'agent_memory_destination_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    granteeConnectionId: uuid('grantee_connection_id').notNull().references(() => agentMemoryConnections.id, { onDelete: 'restrict' }),
    destinationId: uuid('destination_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    capability: agentMemoryGrantCapabilityEnum('capability').notNull().default('read'),
    state: agentMemoryGrantStateEnum('state').notNull().default('active'),
    grantedByUserId: uuid('granted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    granteeDestinationCapabilityUnique: uniqueIndex('agent_memory_destination_grants_unique').on(table.granteeConnectionId, table.destinationId, table.capability),
    destination: index('agent_memory_destination_grants_destination_idx').on(table.destinationId),
  }),
);

export const agentMemoryRecords = pgTable(
  'agent_memory_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    /** 040: producing connection for a newly created connection-backed record; null for legacy 039 rows. */
    authorConnectionId: uuid('author_connection_id').references(() => agentMemoryConnections.id, { onDelete: 'restrict' }),
    recordType: agentMemoryRecordTypeEnum('record_type').notNull(),
    /** 040: closed provenance; null on legacy rows written before this column existed. */
    origin: agentMemoryOriginEnum('origin'),
    contentKind: agentMemoryContentKindEnum('content_kind').notNull().default('original'),
    pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'restrict' }),
    currentRevisionId: uuid('current_revision_id').notNull().references(() => pageRevisions.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    sourceSessionDigest: text('source_session_digest'),
    state: agentMemoryRecordStateEnum('state').notNull().default('active'),
    forgottenAt: timestamp('forgotten_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespaceIdentityIdempotency: uniqueIndex('agent_memory_records_namespace_identity_idempotency_unique').on(table.namespaceId, table.agentIdentity, table.idempotencyKey),
    connectionIdempotency: uniqueIndex('agent_memory_records_connection_idempotency_unique').on(table.authorConnectionId, table.idempotencyKey),
    namespaceStateUpdated: index('agent_memory_records_namespace_state_updated_idx').on(table.namespaceId, table.state, table.updatedAt),
    page: uniqueIndex('agent_memory_records_page_unique').on(table.pageId),
  }),
);

export const agentMemoryEvidenceLinks = pgTable(
  'agent_memory_evidence_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryRecordId: uuid('memory_record_id').notNull().references(() => agentMemoryRecords.id, { onDelete: 'restrict' }),
    evidenceRecordId: uuid('evidence_record_id').notNull().references(() => agentMemoryRecords.id, { onDelete: 'restrict' }),
    relation: agentMemoryEvidenceRelationEnum('relation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memoryEvidenceUnique: uniqueIndex('agent_memory_evidence_links_unique').on(table.memoryRecordId, table.evidenceRecordId, table.relation),
    evidence: index('agent_memory_evidence_links_evidence_idx').on(table.evidenceRecordId),
  }),
);

/** Durable capture state without retaining a second copy of evidence content. */
export const agentMemoryCaptures = pgTable(
  'agent_memory_captures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'restrict' }),
    /** 040: resolved producer connection; worker authorization/retry identity use this, not apiKeyId. Null for legacy rows. */
    connectionId: uuid('connection_id').references(() => agentMemoryConnections.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    idempotencyKey: text('idempotency_key').notNull(),
    /** Digest of the normalized request payload, used to reject idempotency-key reuse with different evidence. */
    payloadDigest: text('payload_digest').notNull().default('legacy'),
    sessionDigest: text('session_digest').notNull(),
    checkpoint: boolean('checkpoint').notNull().default(false),
    /** 040: closed capture kind; defaults to 'checkpoint'/'turn' equivalent for legacy Hermes rows via application logic. */
    captureKind: agentMemoryCaptureKindEnum('capture_kind').notNull().default('turn'),
    status: agentMemoryCaptureStatusEnum('status').notNull().default('queued'),
    /** 040: worker-only transient encrypted payload. Bounded to 1 MB/24h — see @next-wiki/shared AGENT_MEMORY_BOUNDS. Deleted after durable completion, cancellation, or expiry. */
    payloadEncrypted: text('payload_encrypted'),
    payloadExpiresAt: timestamp('payload_expires_at', { withTimezone: true }),
    evidenceRecordId: uuid('evidence_record_id').references(() => agentMemoryRecords.id, { onDelete: 'restrict' }),
    jobId: text('job_id'),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespaceIdentityIdempotency: uniqueIndex('agent_memory_captures_namespace_identity_idempotency_unique').on(table.namespaceId, table.agentIdentity, table.idempotencyKey),
    apiKey: index('agent_memory_captures_api_key_idx').on(table.apiKeyId),
    statusUpdated: index('agent_memory_captures_status_updated_idx').on(table.status, table.updatedAt),
  }),
);

export const agentMemoryNamespacesRelations = relations(agentMemoryNamespaces, ({ one, many }) => ({
  owner: one(users, { fields: [agentMemoryNamespaces.ownerUserId], references: [users.id] }),
  keyBindings: many(agentMemoryKeyBindings),
  records: many(agentMemoryRecords),
  captures: many(agentMemoryCaptures),
  grants: many(agentMemoryDestinationGrants),
}));

export const agentMemoryConnectionsRelations = relations(agentMemoryConnections, ({ one, many }) => ({
  owner: one(users, { fields: [agentMemoryConnections.ownerUserId], references: [users.id] }),
  privateNamespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryConnections.privateNamespaceId],
    references: [agentMemoryNamespaces.id],
  }),
  keyBindings: many(agentMemoryKeyBindings),
  grants: many(agentMemoryDestinationGrants),
}));

export const agentMemoryDestinationGrantsRelations = relations(agentMemoryDestinationGrants, ({ one }) => ({
  granteeConnection: one(agentMemoryConnections, {
    fields: [agentMemoryDestinationGrants.granteeConnectionId],
    references: [agentMemoryConnections.id],
  }),
  destination: one(agentMemoryNamespaces, {
    fields: [agentMemoryDestinationGrants.destinationId],
    references: [agentMemoryNamespaces.id],
  }),
  grantedBy: one(users, { fields: [agentMemoryDestinationGrants.grantedByUserId], references: [users.id] }),
}));

export const agentMemoryKeyBindingsRelations = relations(agentMemoryKeyBindings, ({ one }) => ({
  key: one(apiKeys, { fields: [agentMemoryKeyBindings.apiKeyId], references: [apiKeys.id] }),
  namespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryKeyBindings.namespaceId],
    references: [agentMemoryNamespaces.id],
  }),
  connection: one(agentMemoryConnections, {
    fields: [agentMemoryKeyBindings.connectionId],
    references: [agentMemoryConnections.id],
  }),
}));

export const agentMemoryRecordsRelations = relations(agentMemoryRecords, ({ one, many }) => ({
  namespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryRecords.namespaceId],
    references: [agentMemoryNamespaces.id],
  }),
  authorConnection: one(agentMemoryConnections, {
    fields: [agentMemoryRecords.authorConnectionId],
    references: [agentMemoryConnections.id],
  }),
  page: one(pages, { fields: [agentMemoryRecords.pageId], references: [pages.id] }),
  revision: one(pageRevisions, {
    fields: [agentMemoryRecords.currentRevisionId],
    references: [pageRevisions.id],
  }),
  evidenceFor: many(agentMemoryEvidenceLinks, { relationName: 'memory_record' }),
  evidenceLinks: many(agentMemoryEvidenceLinks, { relationName: 'evidence_record' }),
}));

export const agentMemoryEvidenceLinksRelations = relations(agentMemoryEvidenceLinks, ({ one }) => ({
  memory: one(agentMemoryRecords, {
    fields: [agentMemoryEvidenceLinks.memoryRecordId],
    references: [agentMemoryRecords.id],
    relationName: 'memory_record',
  }),
  evidence: one(agentMemoryRecords, {
    fields: [agentMemoryEvidenceLinks.evidenceRecordId],
    references: [agentMemoryRecords.id],
    relationName: 'evidence_record',
  }),
}));

export const agentMemoryCapturesRelations = relations(agentMemoryCaptures, ({ one }) => ({
  namespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryCaptures.namespaceId],
    references: [agentMemoryNamespaces.id],
  }),
  connection: one(agentMemoryConnections, {
    fields: [agentMemoryCaptures.connectionId],
    references: [agentMemoryConnections.id],
  }),
  evidenceRecord: one(agentMemoryRecords, {
    fields: [agentMemoryCaptures.evidenceRecordId],
    references: [agentMemoryRecords.id],
  }),
}));
