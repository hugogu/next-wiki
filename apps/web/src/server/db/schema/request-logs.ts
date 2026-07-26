import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './index';
import { outboundRequestOutcomeEnum, requestLogLevelEnum } from './enums';

export const requestLogSettings = pgTable(
  'request_log_settings',
  {
    id: text('id').primaryKey().default('default'),
    enabled: boolean('enabled').notNull().default(false),
    level: requestLogLevelEnum('level').notNull().default('status'),
    retentionHours: integer('retention_hours').notNull().default(24),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    singletonId: check('request_log_settings_singleton_id', sql`${t.id} = 'default'`),
    retentionBounds: check('request_log_settings_retention_bounds', sql`${t.retentionHours} between 1 and 168`),
  }),
);

export const requestLogSettingsRelations = relations(requestLogSettings, ({ one }) => ({
  updatedByUser: one(users, { fields: [requestLogSettings.updatedBy], references: [users.id] }),
}));

export const outboundRequestLogs = pgTable(
  'outbound_request_logs',
  {
    id: uuid('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    providerKey: text('provider_key'),
    operation: text('operation').notNull(),
    attempt: integer('attempt').notNull().default(1),
    method: text('method').notNull(),
    targetHost: text('target_host'),
    targetPath: text('target_path'),
    statusCode: integer('status_code'),
    outcome: outboundRequestOutcomeEnum('outcome').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    providerRequestId: text('provider_request_id'),
    correlationId: text('correlation_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    captureLevel: requestLogLevelEnum('capture_level').notNull(),
    targetEncrypted: text('target_encrypted'),
    requestHeadersEncrypted: text('request_headers_encrypted'),
    responseHeadersEncrypted: text('response_headers_encrypted'),
    requestBodyEncrypted: text('request_body_encrypted'),
    responseBodyEncrypted: text('response_body_encrypted'),
    errorDetailEncrypted: text('error_detail_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    attemptPositive: check('outbound_request_logs_attempt_positive', sql`${t.attempt} >= 1`),
    durationNonnegative: check('outbound_request_logs_duration_nonnegative', sql`${t.durationMs} is null or ${t.durationMs} >= 0`),
    createdOrderIdx: index('outbound_request_logs_created_order_idx').on(t.createdAt, t.id),
    sourceCreatedIdx: index('outbound_request_logs_source_created_idx').on(t.sourceType, t.createdAt, t.id),
    providerCreatedIdx: index('outbound_request_logs_provider_created_idx').on(t.providerKey, t.createdAt, t.id),
    operationCreatedIdx: index('outbound_request_logs_operation_created_idx').on(t.operation, t.createdAt, t.id),
    outcomeCreatedIdx: index('outbound_request_logs_outcome_created_idx').on(t.outcome, t.createdAt, t.id),
    statusCreatedIdx: index('outbound_request_logs_status_created_idx').on(t.statusCode, t.createdAt, t.id),
    correlationCreatedIdx: index('outbound_request_logs_correlation_created_idx').on(t.correlationId, t.createdAt, t.id),
    expiresIdx: index('outbound_request_logs_expires_idx').on(t.expiresAt),
  }),
);

