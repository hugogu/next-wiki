import { CronExpressionParser } from 'cron-parser';
import { and, desc, eq, ilike, inArray, isNull, lte } from 'drizzle-orm';
import {
  scheduledAiJobCreateSchema,
  scheduledAiJobDefinitionSnapshotSchema,
  scheduledAiJobScopeSchema,
  type ScheduledAiJobDefinitionSnapshot,
  type ScheduledAiJobListFilter,
  type ScheduledAiJobRunListFilter,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';

type DefinitionFields = Pick<typeof schema.scheduledAiJobs.$inferSelect,
  'id' | 'name' | 'taskDescription' | 'scheduleCron' | 'timeZone' | 'targetScope' | 'runAsUserId' | 'definitionVersion'>;

function assertManager(ctx: PermCtx) {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage scheduled AI jobs');
  }
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function validateScheduledAiJobSchedule(scheduleCron: string, timeZone: string): void {
  if (scheduleCron.trim().split(/\s+/).length !== 5) {
    throw new DomainError('BAD_REQUEST', 'SCHEDULE_INVALID: schedules require exactly five cron fields');
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new DomainError('BAD_REQUEST', 'TIME_ZONE_INVALID: time zone must be an IANA identifier');
  }
  try {
    CronExpressionParser.parse(scheduleCron, { tz: timeZone, strict: true });
  } catch {
    throw new DomainError('BAD_REQUEST', 'SCHEDULE_INVALID: invalid cron expression');
  }
}

export function nextScheduledAiJobOccurrence(scheduleCron: string, timeZone: string, after = new Date()): Date {
  validateScheduledAiJobSchedule(scheduleCron, timeZone);
  try {
    return CronExpressionParser.parse(scheduleCron, { tz: timeZone, currentDate: after, strict: true }).next().toDate();
  } catch {
    throw new DomainError('BAD_REQUEST', 'SCHEDULE_INVALID: schedule has no future occurrence');
  }
}

export function buildScheduledAiJobSnapshot(definition: DefinitionFields): ScheduledAiJobDefinitionSnapshot {
  return Object.freeze(scheduledAiJobDefinitionSnapshotSchema.parse({
    version: definition.definitionVersion,
    name: definition.name,
    taskDescription: definition.taskDescription,
    scheduleCron: definition.scheduleCron,
    timeZone: definition.timeZone,
    targetScope: definition.targetScope,
    runAsUserId: definition.runAsUserId,
  }));
}

async function validateOwnerAndScope(runAsUserId: string, targetScope: unknown) {
  const scope = scheduledAiJobScopeSchema.parse(targetScope);
  const owner = await db.query.users.findFirst({ where: eq(schema.users.id, runAsUserId) });
  if (!owner || owner.status !== 'active' || owner.deletedAt) {
    throw new DomainError('BAD_REQUEST', 'SCHEDULED_JOB_OWNER_INELIGIBLE: execution owner must be active');
  }
  if (scope.spaceIds.length) {
    const spaces = await db.select({ id: schema.spaces.id }).from(schema.spaces).where(inArray(schema.spaces.id, scope.spaceIds));
    if (spaces.length !== scope.spaceIds.length) throw new DomainError('BAD_REQUEST', 'SCHEDULED_JOB_SCOPE_INVALID: space does not exist');
  }
  if (scope.rootPageIds.length) {
    const pages = await db.select({ id: schema.pages.id }).from(schema.pages).where(and(inArray(schema.pages.id, scope.rootPageIds), isNull(schema.pages.deletedAt)));
    if (pages.length !== scope.rootPageIds.length) throw new DomainError('BAD_REQUEST', 'SCHEDULED_JOB_SCOPE_INVALID: root page does not exist');
  }
  return scope;
}

function definitionView(row: typeof schema.scheduledAiJobs.$inferSelect) {
  return {
    id: row.id, name: row.name, status: row.status, scheduleCron: row.scheduleCron, timeZone: row.timeZone,
    targetScope: scheduledAiJobScopeSchema.parse(row.targetScope), runAsUserId: row.runAsUserId,
    definitionVersion: row.definitionVersion, nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  };
}

function runView(row: typeof schema.scheduledAiJobRuns.$inferSelect) {
  return {
    id: row.id, jobId: row.jobId, trigger: row.trigger, status: row.status,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    definitionSnapshot: scheduledAiJobDefinitionSnapshotSchema.parse(row.definitionSnapshot),
    startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null,
    errorCode: row.errorCode, errorMessage: row.errorMessage,
  };
}

export async function createScheduledAiJob(ctx: PermCtx, input: unknown) {
  assertManager(ctx);
  const parsed = scheduledAiJobCreateSchema.parse(input);
  validateScheduledAiJobSchedule(parsed.scheduleCron, parsed.timeZone);
  const scope = await validateOwnerAndScope(parsed.runAsUserId, parsed.targetScope);
  const now = new Date();
  try {
    const [row] = await db.insert(schema.scheduledAiJobs).values({
      ...parsed, targetScope: scope, normalizedName: normalizeName(parsed.name),
      nextRunAt: parsed.status === 'enabled' ? nextScheduledAiJobOccurrence(parsed.scheduleCron, parsed.timeZone, now) : null,
      createdByUserId: getActorUserId(ctx), updatedByUserId: getActorUserId(ctx),
    }).returning();
    if (!row) throw new Error('Failed to create scheduled AI job');
    return definitionView(row);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('CONFLICT', 'SCHEDULED_JOB_NAME_CONFLICT: job name already exists');
  }
}

export async function listScheduledAiJobs(ctx: PermCtx, input: Partial<ScheduledAiJobListFilter> = {}) {
  assertManager(ctx);
  const rows = await db.select().from(schema.scheduledAiJobs)
    .where(and(input.status ? eq(schema.scheduledAiJobs.status, input.status) : undefined, input.q ? ilike(schema.scheduledAiJobs.name, `%${input.q.trim()}%`) : undefined))
    .orderBy(desc(schema.scheduledAiJobs.updatedAt)).limit(input.limit ?? 25).offset(input.offset ?? 0);
  return rows.map(definitionView);
}

export async function getScheduledAiJob(ctx: PermCtx, id: string) {
  assertManager(ctx);
  const row = await db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.id, id) });
  if (!row) throw new DomainError('NOT_FOUND', 'Scheduled AI job not found');
  return definitionView(row);
}

export async function updateScheduledAiJob(ctx: PermCtx, id: string, input: unknown) {
  assertManager(ctx);
  const current = await db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.id, id) });
  if (!current) throw new DomainError('NOT_FOUND', 'Scheduled AI job not found');
  const update = scheduledAiJobCreateSchema.partial().parse(input);
  const candidate = scheduledAiJobCreateSchema.parse({ ...current, ...update, targetScope: update.targetScope ?? current.targetScope });
  validateScheduledAiJobSchedule(candidate.scheduleCron, candidate.timeZone);
  const scope = await validateOwnerAndScope(candidate.runAsUserId, candidate.targetScope);
  const executionChanged = ['taskDescription', 'scheduleCron', 'timeZone', 'runAsUserId', 'targetScope', 'status'].some((key) => key in update);
  const nextRunAt = candidate.status === 'enabled' ? nextScheduledAiJobOccurrence(candidate.scheduleCron, candidate.timeZone) : null;
  const [row] = await db.update(schema.scheduledAiJobs).set({
    ...candidate, targetScope: scope, normalizedName: normalizeName(candidate.name), nextRunAt,
    definitionVersion: executionChanged ? current.definitionVersion + 1 : current.definitionVersion,
    updatedByUserId: getActorUserId(ctx), updatedAt: new Date(),
  }).where(eq(schema.scheduledAiJobs.id, id)).returning();
  return definitionView(row!);
}

export async function retireScheduledAiJob(ctx: PermCtx, id: string) {
  assertManager(ctx);
  const [row] = await db.update(schema.scheduledAiJobs).set({ status: 'retired', nextRunAt: null, retiredAt: new Date(), updatedAt: new Date(), updatedByUserId: getActorUserId(ctx) }).where(eq(schema.scheduledAiJobs.id, id)).returning();
  if (!row) throw new DomainError('NOT_FOUND', 'Scheduled AI job not found');
  await db.update(schema.scheduledAiJobRuns).set({ cancelRequested: true }).where(and(eq(schema.scheduledAiJobRuns.jobId, id), inArray(schema.scheduledAiJobRuns.status, ['queued', 'running'])));
  return definitionView(row);
}

async function createRun(job: typeof schema.scheduledAiJobs.$inferSelect, trigger: 'schedule' | 'manual' | 'recovery', scheduledFor: Date | null) {
  const [run] = await db.insert(schema.scheduledAiJobRuns).values({
    jobId: job.id, trigger, scheduledFor, definitionVersion: job.definitionVersion,
    definitionSnapshot: buildScheduledAiJobSnapshot(job), runAsUserId: job.runAsUserId,
  }).returning();
  if (!run) throw new Error('Failed to create scheduled AI job run');
  await enqueue(QUEUES.scheduledAiRun, { runId: run.id }, { singletonKey: run.id, singletonSeconds: 60 });
  return runView(run);
}

export async function runScheduledAiJobNow(ctx: PermCtx, id: string) {
  assertManager(ctx);
  const job = await db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.id, id) });
  if (!job || job.status === 'retired') throw new DomainError('NOT_FOUND', 'Scheduled AI job not found');
  try { return await createRun(job, 'manual', null); } catch { throw new DomainError('CONFLICT', 'SCHEDULED_JOB_ACTIVE_RUN: an active run already exists'); }
}

export async function listScheduledAiJobRuns(ctx: PermCtx, jobId: string, input: Partial<ScheduledAiJobRunListFilter> = {}) {
  assertManager(ctx);
  const rows = await db.select().from(schema.scheduledAiJobRuns).where(and(eq(schema.scheduledAiJobRuns.jobId, jobId), input.status ? eq(schema.scheduledAiJobRuns.status, input.status) : undefined, input.trigger ? eq(schema.scheduledAiJobRuns.trigger, input.trigger) : undefined)).orderBy(desc(schema.scheduledAiJobRuns.queuedAt)).limit(input.limit ?? 25).offset(input.offset ?? 0);
  return rows.map(runView);
}

export async function getScheduledAiJobRun(ctx: PermCtx, jobId: string, runId: string) {
  assertManager(ctx);
  const run = await db.query.scheduledAiJobRuns.findFirst({ where: and(eq(schema.scheduledAiJobRuns.id, runId), eq(schema.scheduledAiJobRuns.jobId, jobId)) });
  if (!run) throw new DomainError('NOT_FOUND', 'Scheduled AI job run not found');
  const proposals = await db.select({ id: schema.aiToolChangeProposals.id, title: schema.aiToolChangeProposals.title, status: schema.aiToolChangeProposals.status })
    .from(schema.aiToolChangeProposals).where(eq(schema.aiToolChangeProposals.scheduledAiJobRunId, run.id));
  return { ...runView(run), actionId: run.aiActionId, proposalLinks: proposals.map((proposal) => ({
    ...proposal, href: `/admin/ai/tools/proposals/${proposal.id}`,
  })) };
}

export async function listAllScheduledAiJobRuns(ctx: PermCtx, input: Partial<ScheduledAiJobRunListFilter> & { jobId?: string } = {}) {
  assertManager(ctx);
  const rows = await db.select().from(schema.scheduledAiJobRuns).where(and(
    input.jobId ? eq(schema.scheduledAiJobRuns.jobId, input.jobId) : undefined,
    input.status ? eq(schema.scheduledAiJobRuns.status, input.status) : undefined,
    input.trigger ? eq(schema.scheduledAiJobRuns.trigger, input.trigger) : undefined,
  )).orderBy(desc(schema.scheduledAiJobRuns.queuedAt)).limit(input.limit ?? 25).offset(input.offset ?? 0);
  return rows.map(runView);
}

export async function duplicateScheduledAiJob(ctx: PermCtx, id: string) {
  assertManager(ctx);
  const source = await db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.id, id) });
  if (!source) throw new DomainError('NOT_FOUND', 'Scheduled AI job not found');
  let suffix = 1;
  let name = `${source.name} copy`;
  while (await db.query.scheduledAiJobs.findFirst({ where: eq(schema.scheduledAiJobs.normalizedName, normalizeName(name)) })) {
    suffix += 1; name = `${source.name} copy ${suffix}`;
  }
  const [copy] = await db.insert(schema.scheduledAiJobs).values({
    name, normalizedName: normalizeName(name), taskDescription: source.taskDescription,
    scheduleCron: source.scheduleCron, timeZone: source.timeZone, targetScope: source.targetScope,
    runAsUserId: source.runAsUserId, status: 'paused', definitionVersion: 1,
    createdByUserId: getActorUserId(ctx), updatedByUserId: getActorUserId(ctx),
  }).returning();
  return definitionView(copy!);
}

export async function cancelScheduledAiJobRun(ctx: PermCtx, jobId: string, runId: string) {
  assertManager(ctx);
  const [run] = await db.update(schema.scheduledAiJobRuns).set({ cancelRequested: true }).where(and(eq(schema.scheduledAiJobRuns.id, runId), eq(schema.scheduledAiJobRuns.jobId, jobId), inArray(schema.scheduledAiJobRuns.status, ['queued', 'running']))).returning();
  if (!run) throw new DomainError('NOT_FOUND', 'Scheduled AI job run is not cancellable');
  return runView(run);
}

/** Claims all currently due definitions. The active-slot index is the concurrency authority. */
export async function tickScheduledAiJobs(now = new Date()) {
  const due = await db.select().from(schema.scheduledAiJobs).where(and(eq(schema.scheduledAiJobs.status, 'enabled'), lte(schema.scheduledAiJobs.nextRunAt, now))).limit(100);
  for (const job of due) {
    const occurrence = job.nextRunAt!;
    const nextRunAt = nextScheduledAiJobOccurrence(job.scheduleCron, job.timeZone, now);
    await db.update(schema.scheduledAiJobs).set({ nextRunAt, updatedAt: now }).where(and(eq(schema.scheduledAiJobs.id, job.id), eq(schema.scheduledAiJobs.nextRunAt, occurrence)));
    try { await createRun(job, 'schedule', occurrence); } catch { /* occurrence/active uniqueness makes repeated ticks safe */ }
  }
}
