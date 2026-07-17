import bcrypt from 'bcryptjs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type {
  SetupAiResult,
  SetupAiStatus,
  SetupSamplePageResult,
  SetupSamplePagesStatus,
  SetupStateView,
  SetupStep,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { hasAnyAdmin } from '@/server/services/users';
import { DomainError } from '@/server/errors';
import type { Actor } from '@/server/permissions';

export const SETUP_PROGRESS_ID = 'default';

/** Advisory xact lock key serializing first-admin creation across requests. */
const SETUP_ADMIN_LOCK_KEY = 727_021;

export type SetupProgressRow = typeof schema.setupProgress.$inferSelect;

/** Returns true when no Admin exists yet, i.e. the account step is open. */
export async function isSetupNeeded(): Promise<boolean> {
  return !(await hasAnyAdmin());
}

export async function getSetupProgress(): Promise<SetupProgressRow | null> {
  const row = await db.query.setupProgress.findFirst({
    where: eq(schema.setupProgress.id, SETUP_PROGRESS_ID),
  });
  return row ?? null;
}

async function ensureSetupProgress(): Promise<SetupProgressRow> {
  const existing = await getSetupProgress();
  if (existing) return existing;
  await db
    .insert(schema.setupProgress)
    .values({ id: SETUP_PROGRESS_ID })
    .onConflictDoNothing();
  const row = await getSetupProgress();
  if (!row) throw new Error('SETUP_PROGRESS_UNAVAILABLE');
  return row;
}

/**
 * One-time bootstrap: create the first Admin account and record onboarding
 * progress atomically. Concurrent submissions serialize on an advisory lock so
 * exactly one Admin can be created.
 */
export async function setupAdmin(input: { email: string; password: string }): Promise<{ userId: string }> {
  if (input.password.length < 8) {
    throw new DomainError('BAD_REQUEST', 'Password must be at least 8 characters');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const userId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETUP_ADMIN_LOCK_KEY})`);
    const existingAdmin = await tx.query.users.findFirst({
      where: and(eq(schema.users.role, 'admin'), isNull(schema.users.deletedAt)),
    });
    if (existingAdmin) {
      throw new DomainError('FORBIDDEN', 'An admin account already exists');
    }
    const existingEmail = await tx.query.users.findFirst({
      where: eq(schema.users.email, input.email),
    });
    if (existingEmail) {
      throw new DomainError('CONFLICT', 'An account with this email already exists');
    }
    const [user] = await tx
      .insert(schema.users)
      .values({
        email: input.email,
        passwordHash,
        role: 'admin',
        status: 'active',
      })
      .returning();
    if (!user) throw new Error('SETUP_FAILED');
    await tx
      .insert(schema.setupProgress)
      .values({
        id: SETUP_PROGRESS_ID,
        adminUserId: user.id,
        accountStatus: 'created',
        currentStep: 'ai',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.setupProgress.id,
        set: {
          adminUserId: user.id,
          accountStatus: 'created',
          currentStep: 'ai',
          updatedAt: new Date(),
        },
      });
    return user.id;
  });

  await authService.establishSession(userId);
  return { userId };
}

/**
 * Guards post-account setup mutations: the caller must be a signed-in Admin
 * and setup must be open (progress row exists, account created, not closed).
 */
export async function assertSetupAdmin(actor: Actor): Promise<SetupProgressRow> {
  if (actor.kind !== 'user' || actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'Setup requires the initial admin account');
  }
  const progress = await getSetupProgress();
  if (!progress || progress.currentStep === 'closed' || progress.accountStatus !== 'created') {
    throw new DomainError('FORBIDDEN', 'First-run setup is not available');
  }
  return progress;
}

async function updateProgress(
  set: Partial<typeof schema.setupProgress.$inferInsert>,
): Promise<void> {
  await ensureSetupProgress();
  await db
    .update(schema.setupProgress)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(schema.setupProgress.id, SETUP_PROGRESS_ID));
}

/** AI step skipped by the Admin. Idempotent: a terminal AI state is kept. */
export async function recordAiSkip(): Promise<void> {
  const progress = await ensureSetupProgress();
  if (['skipped', 'completed', 'partial'].includes(progress.aiStatus)) return;
  const result: SetupAiResult = {
    wiki_text: { status: 'skipped' },
    wiki_embedding: { status: 'skipped' },
    wiki_image: { status: 'skipped' },
  };
  await updateProgress({
    aiStatus: 'skipped',
    aiResult: result,
    aiActionId: null,
    currentStep: nextStepAfterAi(progress),
  });
}

export async function recordAiQueued(actionId: string): Promise<void> {
  await updateProgress({ aiStatus: 'queued', aiActionId: actionId, currentStep: 'ai' });
}

/**
 * Records a terminal AI bootstrap outcome. `completed`/`partial` advance to
 * the sample-pages step; `failed`/`disabled` stay on the AI step so the Admin
 * can retry or skip.
 */
export async function recordAiTerminal(outcome: {
  status: Extract<SetupAiStatus, 'completed' | 'partial' | 'failed' | 'disabled'>;
  result: SetupAiResult;
  actionId?: string | null;
}): Promise<void> {
  const progress = await ensureSetupProgress();
  const advances = outcome.status === 'completed' || outcome.status === 'partial';
  await updateProgress({
    aiStatus: outcome.status,
    aiResult: outcome.result,
    ...(outcome.actionId !== undefined ? { aiActionId: outcome.actionId } : {}),
    currentStep: advances ? nextStepAfterAi(progress) : 'ai',
  });
}

function nextStepAfterAi(progress: SetupProgressRow): SetupStep {
  return progress.samplePagesStatus === 'not_started' ? 'sample_pages' : 'summary';
}

/** Sample-pages step skipped by the Admin. Idempotent. */
export async function recordSamplePagesSkip(): Promise<void> {
  const progress = await ensureSetupProgress();
  if (['skipped', 'completed', 'partial'].includes(progress.samplePagesStatus)) return;
  await updateProgress({
    samplePagesStatus: 'skipped',
    samplePagesResult: [],
    currentStep: 'summary',
    completedAt: progress.completedAt ?? new Date(),
  });
}

/** Records the sample-pages generation outcome and completes onboarding. */
export async function recordSamplePagesOutcome(
  status: Extract<SetupSamplePagesStatus, 'completed' | 'partial' | 'failed'>,
  results: SetupSamplePageResult[],
): Promise<void> {
  const progress = await ensureSetupProgress();
  await updateProgress({
    samplePagesStatus: status,
    samplePagesResult: results,
    currentStep: status === 'failed' ? progress.currentStep : 'summary',
    completedAt: status === 'failed' ? progress.completedAt : (progress.completedAt ?? new Date()),
  });
}

function shapeAiResult(progress: SetupProgressRow): SetupAiResult | null {
  if (!progress.aiResult || typeof progress.aiResult !== 'object') return null;
  const raw = progress.aiResult as SetupAiResult;
  return {
    ...(raw.wiki_text ? { wiki_text: raw.wiki_text } : {}),
    ...(raw.wiki_embedding ? { wiki_embedding: raw.wiki_embedding } : {}),
    ...(raw.wiki_image ? { wiki_image: raw.wiki_image } : {}),
  };
}

function shapeSamplePagesResult(progress: SetupProgressRow): SetupSamplePageResult[] | null {
  if (!Array.isArray(progress.samplePagesResult)) return null;
  return progress.samplePagesResult as SetupSamplePageResult[];
}

/**
 * Returns the onboarding state shaped for the caller. Anonymous and non-Admin
 * callers only learn whether account setup is needed; the signed-in Admin gets
 * the full resumable state including the summary. Never includes credentials.
 */
export async function getSetupState(actor: Actor): Promise<SetupStateView> {
  const adminExists = await hasAnyAdmin();
  if (!adminExists) {
    return { needed: true, currentStep: 'account', accountStatus: 'needed' };
  }
  const progress = await getSetupProgress();
  // An Admin without a progress row predates onboarding: setup stays closed.
  if (!progress || progress.currentStep === 'closed') {
    return { needed: false, currentStep: 'closed' };
  }
  const isAdmin = actor.kind === 'user' && actor.role === 'admin';
  if (!isAdmin) {
    return { needed: true, currentStep: 'account', accountStatus: 'created' };
  }
  const complete = progress.currentStep === 'summary';
  return {
    needed: !complete,
    currentStep: progress.currentStep,
    accountStatus: progress.accountStatus,
    aiStatus: progress.aiStatus,
    samplePagesStatus: progress.samplePagesStatus,
    summary: {
      adminCreated: progress.accountStatus === 'created',
      ai: shapeAiResult(progress),
      samplePages: shapeSamplePagesResult(progress),
    },
  };
}
