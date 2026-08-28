import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  agentMemoryConnectionStateEnum,
  agentMemoryDestinationRoleEnum,
  agentMemoryCaptureStatusEnum,
  agentMemoryEvidenceRelationEnum,
  agentMemoryGrantCapabilityEnum,
  agentMemoryGrantStateEnum,
  agentMemoryNamespaceStateEnum,
  agentMemoryRecordOriginEnum,
  agentMemoryRecordRoleEnum,
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

/** Stable owner-authorized identity independent from any rotatable API key. */
export const agentMemoryConnections = pgTable(
  'agent_memory_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull(),
    displayLabel: text('display_label').notNull(),
    state: agentMemoryConnectionStateEnum('state').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (table) => ({
    ownerCreated: index('agent_memory_connections_owner_created_idx').on(table.ownerUserId, table.createdAt),
    namespace: uniqueIndex('agent_memory_connections_namespace_unique').on(table.namespaceId),
  }),
);

/** Explicit owner-managed read/write capability for a destination. */
export const agentMemoryDestinationGrants = pgTable(
  'agent_memory_destination_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    granteeConnectionId: uuid('grantee_connection_id').notNull().references(() => agentMemoryConnections.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    capability: agentMemoryGrantCapabilityEnum('capability').notNull(),
    state: agentMemoryGrantStateEnum('state').notNull().default('active'),
    grantedByUserId: uuid('granted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    granteeCapability: index('agent_memory_destination_grants_grantee_capability_idx').on(table.granteeConnectionId, table.capability, table.state),
    destinationCapability: index('agent_memory_destination_grants_destination_capability_idx').on(table.destinationId, table.capability, table.state),
    uniqueActiveGrant: uniqueIndex('agent_memory_destination_grants_unique').on(table.granteeConnectionId, table.destinationId, table.capability),
  }),
);

/** Owner-selected retention metadata. Policy changes never broaden grants or
 * mutate canonical Raw revisions; consumers may archive projections later. */
export const agentMemoryRetentionPolicies = pgTable(
  'agent_memory_retention_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinationId: uuid('destination_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    retentionDays: integer('retention_days').notNull().default(365),
    policyVersion: integer('policy_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ destination: uniqueIndex('agent_memory_retention_policies_destination_unique').on(table.destinationId) }),
);

export const agentMemoryKeyBindings = pgTable(
  'agent_memory_key_bindings',
  {
    apiKeyId: uuid('api_key_id').primaryKey().references(() => apiKeys.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => agentMemoryConnections.id, { onDelete: 'set null' }),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    sharedByOwner: boolean('shared_by_owner').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    namespace: index('agent_memory_key_bindings_namespace_idx').on(table.namespaceId),
  }),
);

export const agentMemoryRecords = pgTable(
  'agent_memory_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespaceId: uuid('namespace_id').notNull().references(() => agentMemoryNamespaces.id, { onDelete: 'restrict' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    authorConnectionId: uuid('author_connection_id').references(() => agentMemoryConnections.id, { onDelete: 'set null' }),
    recordRole: agentMemoryRecordRoleEnum('record_role').notNull().default('synthesis'),
    origin: agentMemoryRecordOriginEnum('origin').notNull().default('explicit_save'),
    recordType: agentMemoryRecordTypeEnum('record_type').notNull(),
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
    namespaceConnectionIdempotency: uniqueIndex('agent_memory_records_namespace_connection_idempotency_unique').on(table.namespaceId, table.authorConnectionId, table.idempotencyKey),
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
    connectionId: uuid('connection_id').references(() => agentMemoryConnections.id, { onDelete: 'set null' }),
    agentIdentity: text('agent_identity').notNull().default('hermes'),
    idempotencyKey: text('idempotency_key').notNull(),
    /** Digest of the normalized request payload, used to reject idempotency-key reuse with different evidence. */
    payloadDigest: text('payload_digest').notNull().default('legacy'),
    payloadEncrypted: text('payload_encrypted'),
    captureKind: text('capture_kind').notNull().default('session'),
    sessionDigest: text('session_digest').notNull(),
    checkpoint: boolean('checkpoint').notNull().default(false),
    status: agentMemoryCaptureStatusEnum('status').notNull().default('queued'),
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
  connections: many(agentMemoryConnections),
  grants: many(agentMemoryDestinationGrants),
  retentionPolicies: many(agentMemoryRetentionPolicies),
}));

export const agentMemoryConnectionsRelations = relations(agentMemoryConnections, ({ one, many }) => ({
  owner: one(users, { fields: [agentMemoryConnections.ownerUserId], references: [users.id] }),
  namespace: one(agentMemoryNamespaces, { fields: [agentMemoryConnections.namespaceId], references: [agentMemoryNamespaces.id] }),
  keyBindings: many(agentMemoryKeyBindings),
  grants: many(agentMemoryDestinationGrants),
}));

export const agentMemoryDestinationGrantsRelations = relations(agentMemoryDestinationGrants, ({ one }) => ({
  grantee: one(agentMemoryConnections, { fields: [agentMemoryDestinationGrants.granteeConnectionId], references: [agentMemoryConnections.id] }),
  destination: one(agentMemoryNamespaces, { fields: [agentMemoryDestinationGrants.destinationId], references: [agentMemoryNamespaces.id] }),
  grantedBy: one(users, { fields: [agentMemoryDestinationGrants.grantedByUserId], references: [users.id] }),
}));

export const agentMemoryRetentionPoliciesRelations = relations(agentMemoryRetentionPolicies, ({ one }) => ({
  destination: one(agentMemoryNamespaces, { fields: [agentMemoryRetentionPolicies.destinationId], references: [agentMemoryNamespaces.id] }),
  owner: one(users, { fields: [agentMemoryRetentionPolicies.ownerUserId], references: [users.id] }),
}));

export const agentMemoryKeyBindingsRelations = relations(agentMemoryKeyBindings, ({ one }) => ({
  key: one(apiKeys, { fields: [agentMemoryKeyBindings.apiKeyId], references: [apiKeys.id] }),
  namespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryKeyBindings.namespaceId],
    references: [agentMemoryNamespaces.id],
  }),
  connection: one(agentMemoryConnections, { fields: [agentMemoryKeyBindings.connectionId], references: [agentMemoryConnections.id] }),
}));

export const agentMemoryRecordsRelations = relations(agentMemoryRecords, ({ one, many }) => ({
  namespace: one(agentMemoryNamespaces, {
    fields: [agentMemoryRecords.namespaceId],
    references: [agentMemoryNamespaces.id],
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
  evidenceRecord: one(agentMemoryRecords, {
    fields: [agentMemoryCaptures.evidenceRecordId],
    references: [agentMemoryRecords.id],
  }),
  connection: one(agentMemoryConnections, { fields: [agentMemoryCaptures.connectionId], references: [agentMemoryConnections.id] }),
}));
