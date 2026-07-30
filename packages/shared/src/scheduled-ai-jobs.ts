import { z } from 'zod';

/** Shared, transport-safe contract for administrator-managed scheduled AI work. */
export const scheduledAiJobStatusSchema = z.enum(['enabled', 'paused', 'retired']);
export type ScheduledAiJobStatus = z.infer<typeof scheduledAiJobStatusSchema>;

export const scheduledAiJobRunStatusSchema = z.enum([
  'queued', 'running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped',
]);
export type ScheduledAiJobRunStatus = z.infer<typeof scheduledAiJobRunStatusSchema>;

export const scheduledAiJobTriggerSchema = z.enum(['schedule', 'manual', 'recovery']);
export type ScheduledAiJobTrigger = z.infer<typeof scheduledAiJobTriggerSchema>;

const uuidList = z.array(z.string().uuid()).max(100).default([]);

/** Resource identifiers only; content is never persisted in a definition. */
export const scheduledAiJobScopeSchema = z.object({
  spaceIds: uuidList,
  rootPageIds: uuidList,
  tagIds: uuidList,
}).superRefine((scope, ctx) => {
  if (scope.spaceIds.length + scope.rootPageIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one space or root page is required' });
  }
});
export type ScheduledAiJobScope = z.infer<typeof scheduledAiJobScopeSchema>;

const cronExpressionSchema = z.string().trim().min(9).max(100).refine(
  (value) => value.split(/\s+/).length === 5,
  'A schedule must use exactly five cron fields',
);
const timeZoneSchema = z.string().trim().min(1).max(100);

export const scheduledAiJobCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  taskDescription: z.string().trim().min(1).max(12_000),
  scheduleCron: cronExpressionSchema,
  timeZone: timeZoneSchema,
  targetScope: scheduledAiJobScopeSchema,
  runAsUserId: z.string().uuid(),
  status: scheduledAiJobStatusSchema.default('paused'),
});
export type ScheduledAiJobCreate = z.infer<typeof scheduledAiJobCreateSchema>;

export const scheduledAiJobUpdateSchema = scheduledAiJobCreateSchema.partial().extend({
  status: scheduledAiJobStatusSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type ScheduledAiJobUpdate = z.infer<typeof scheduledAiJobUpdateSchema>;

export const scheduledAiJobListFilterSchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: scheduledAiJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ScheduledAiJobListFilter = z.infer<typeof scheduledAiJobListFilterSchema>;

export const scheduledAiJobRunListFilterSchema = z.object({
  status: scheduledAiJobRunStatusSchema.optional(),
  trigger: scheduledAiJobTriggerSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ScheduledAiJobRunListFilter = z.infer<typeof scheduledAiJobRunListFilterSchema>;

export const scheduledAiJobDefinitionSnapshotSchema = z.object({
  version: z.number().int().positive(),
  name: z.string(),
  taskDescription: z.string(),
  scheduleCron: z.string(),
  timeZone: z.string(),
  targetScope: scheduledAiJobScopeSchema,
  runAsUserId: z.string().uuid(),
});
export type ScheduledAiJobDefinitionSnapshot = z.infer<typeof scheduledAiJobDefinitionSnapshotSchema>;

export const scheduledAiJobViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  taskDescription: z.string(),
  status: scheduledAiJobStatusSchema,
  scheduleCron: z.string(),
  timeZone: z.string(),
  targetScope: scheduledAiJobScopeSchema,
  runAsUserId: z.string().uuid(),
  definitionVersion: z.number().int().positive(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
});
export type ScheduledAiJobView = z.infer<typeof scheduledAiJobViewSchema>;

export const scheduledAiJobRunViewSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  trigger: scheduledAiJobTriggerSchema,
  status: scheduledAiJobRunStatusSchema,
  scheduledFor: z.string().nullable(),
  definitionSnapshot: scheduledAiJobDefinitionSnapshotSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type ScheduledAiJobRunView = z.infer<typeof scheduledAiJobRunViewSchema>;
