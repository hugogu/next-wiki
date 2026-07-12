import { createHash } from 'node:crypto';
import { desc, eq, max } from 'drizzle-orm';
import type {
  TranslationLanguageCreate,
  TranslationLanguageUpdate,
  TranslationLanguageView,
  TranslationPromptCreate,
  TranslationPromptDetail,
  TranslationPromptTemplateView,
  TranslationPromptUpdate,
  TranslationPromptVersionView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';

/**
 * Translation management is administrator-only (P5). Not exposed to API keys or
 * MCP in this feature — see permissions/index.ts.
 */
export function assertCanManageTranslations(ctx: PermCtx): string {
  if (!can(ctx, 'manage_translations', { kind: 'translations' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage translations');
  }
  const actorId = getActorUserId(ctx);
  if (!actorId) throw new DomainError('UNAUTHORIZED', 'Sign in to manage translations');
  return actorId;
}

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

// ---- Target languages ------------------------------------------------------

type LanguageRow = typeof schema.translationLanguages.$inferSelect;

async function languageView(row: LanguageRow): Promise<TranslationLanguageView> {
  let defaultModelName: string | null = null;
  if (row.defaultModelId) {
    const model = await db.query.aiModels.findFirst({
      where: eq(schema.aiModels.id, row.defaultModelId),
    });
    defaultModelName = model?.displayName ?? null;
  }
  return {
    code: row.code,
    enabled: row.enabled,
    retired: row.retiredAt !== null,
    defaultPromptVersionId: row.defaultPromptVersionId,
    defaultModelId: row.defaultModelId,
    defaultModelName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listLanguages(ctx: PermCtx): Promise<TranslationLanguageView[]> {
  assertCanManageTranslations(ctx);
  const rows = await db
    .select()
    .from(schema.translationLanguages)
    .orderBy(schema.translationLanguages.code);
  return Promise.all(rows.map(languageView));
}

export async function createLanguage(
  ctx: PermCtx,
  input: TranslationLanguageCreate,
): Promise<TranslationLanguageView> {
  const actorId = assertCanManageTranslations(ctx);
  const existing = await db.query.translationLanguages.findFirst({
    where: eq(schema.translationLanguages.code, input.code),
  });
  if (existing) {
    throw new DomainError('INVALID_TRANSLATION_INPUT', 'This language is already configured');
  }
  await assertPromptVersionExists(input.defaultPromptVersionId);
  await assertModelExists(input.defaultModelId);
  const [row] = await db
    .insert(schema.translationLanguages)
    .values({
      code: input.code,
      enabled: input.enabled,
      defaultPromptVersionId: input.defaultPromptVersionId ?? null,
      defaultModelId: input.defaultModelId ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning();
  return languageView(row!);
}

export async function updateLanguage(
  ctx: PermCtx,
  code: string,
  input: TranslationLanguageUpdate,
): Promise<TranslationLanguageView> {
  const actorId = assertCanManageTranslations(ctx);
  const existing = await db.query.translationLanguages.findFirst({
    where: eq(schema.translationLanguages.code, code),
  });
  if (!existing) throw new DomainError('TRANSLATION_NOT_FOUND', 'Language not found');
  if (input.defaultPromptVersionId !== undefined) {
    await assertPromptVersionExists(input.defaultPromptVersionId);
  }
  if (input.defaultModelId !== undefined) {
    await assertModelExists(input.defaultModelId);
  }
  const [row] = await db
    .update(schema.translationLanguages)
    .set({
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.defaultPromptVersionId !== undefined
        ? { defaultPromptVersionId: input.defaultPromptVersionId ?? null }
        : {}),
      ...(input.defaultModelId !== undefined ? { defaultModelId: input.defaultModelId ?? null } : {}),
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(schema.translationLanguages.code, code))
    .returning();
  return languageView(row!);
}

export async function retireLanguage(ctx: PermCtx, code: string): Promise<void> {
  assertCanManageTranslations(ctx);
  const existing = await db.query.translationLanguages.findFirst({
    where: eq(schema.translationLanguages.code, code),
  });
  if (!existing) throw new DomainError('TRANSLATION_NOT_FOUND', 'Language not found');
  // A language cannot be retired while it has active work (a run holding the
  // language's active slot); frozen historical runs and translated pages remain
  // auditable.
  const active = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.activeLanguageSlot, code),
  });
  if (active) {
    throw new DomainError('TRANSLATION_ALREADY_RUNNING', 'Finish active work before retiring');
  }
  await db
    .update(schema.translationLanguages)
    .set({ enabled: false, retiredAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.translationLanguages.code, code));
}

async function assertPromptVersionExists(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const version = await db.query.translationPromptVersions.findFirst({
    where: eq(schema.translationPromptVersions.id, id),
  });
  if (!version) throw new DomainError('INVALID_TRANSLATION_INPUT', 'Prompt version not found');
}

async function assertModelExists(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const model = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, id) });
  if (!model) throw new DomainError('INVALID_TRANSLATION_INPUT', 'Model not found');
}

// ---- Prompt styles ---------------------------------------------------------

type TemplateRow = typeof schema.translationPromptTemplates.$inferSelect;
type VersionRow = typeof schema.translationPromptVersions.$inferSelect;

function versionView(row: VersionRow): TranslationPromptVersionView {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    body: row.body,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

async function templateView(row: TemplateRow): Promise<TranslationPromptTemplateView> {
  const current = await db.query.translationPromptVersions.findFirst({
    where: eq(schema.translationPromptVersions.templateId, row.id),
    orderBy: desc(schema.translationPromptVersions.versionNumber),
  });
  return {
    id: row.id,
    name: row.name,
    retired: row.retiredAt !== null,
    currentVersion: current ? versionView(current) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPrompts(ctx: PermCtx): Promise<TranslationPromptTemplateView[]> {
  assertCanManageTranslations(ctx);
  const rows = await db
    .select()
    .from(schema.translationPromptTemplates)
    .orderBy(schema.translationPromptTemplates.name);
  return Promise.all(rows.map(templateView));
}

export async function createPrompt(
  ctx: PermCtx,
  input: TranslationPromptCreate,
): Promise<TranslationPromptDetail> {
  const actorId = assertCanManageTranslations(ctx);
  const existing = await db.query.translationPromptTemplates.findFirst({
    where: eq(schema.translationPromptTemplates.name, input.name),
  });
  if (existing) {
    throw new DomainError('INVALID_TRANSLATION_INPUT', 'A style with this name already exists');
  }
  const template = await db.transaction(async (tx) => {
    const [tpl] = await tx
      .insert(schema.translationPromptTemplates)
      .values({ name: input.name, createdBy: actorId })
      .returning();
    await tx.insert(schema.translationPromptVersions).values({
      templateId: tpl!.id,
      versionNumber: 1,
      body: input.body,
      contentHash: hashBody(input.body),
      createdBy: actorId,
    });
    return tpl!;
  });
  return getPrompt(ctx, template.id);
}

export async function updatePrompt(
  ctx: PermCtx,
  id: string,
  input: TranslationPromptUpdate,
): Promise<TranslationPromptDetail> {
  const actorId = assertCanManageTranslations(ctx);
  const template = await db.query.translationPromptTemplates.findFirst({
    where: eq(schema.translationPromptTemplates.id, id),
  });
  if (!template) throw new DomainError('TRANSLATION_NOT_FOUND', 'Style not found');
  // A new version is always appended; existing versions are immutable.
  await db.transaction(async (tx) => {
    const maxRows = await tx
      .select({ value: max(schema.translationPromptVersions.versionNumber) })
      .from(schema.translationPromptVersions)
      .where(eq(schema.translationPromptVersions.templateId, id));
    const maxVersion = maxRows[0]?.value ?? 0;
    await tx.insert(schema.translationPromptVersions).values({
      templateId: id,
      versionNumber: maxVersion + 1,
      body: input.body,
      contentHash: hashBody(input.body),
      createdBy: actorId,
    });
    await tx
      .update(schema.translationPromptTemplates)
      .set({ updatedAt: new Date() })
      .where(eq(schema.translationPromptTemplates.id, id));
  });
  return getPrompt(ctx, id);
}

export async function getPrompt(ctx: PermCtx, id: string): Promise<TranslationPromptDetail> {
  assertCanManageTranslations(ctx);
  const template = await db.query.translationPromptTemplates.findFirst({
    where: eq(schema.translationPromptTemplates.id, id),
  });
  if (!template) throw new DomainError('TRANSLATION_NOT_FOUND', 'Style not found');
  const versions = await db
    .select()
    .from(schema.translationPromptVersions)
    .where(eq(schema.translationPromptVersions.templateId, id))
    .orderBy(desc(schema.translationPromptVersions.versionNumber));
  const base = await templateView(template);
  return { ...base, versions: versions.map(versionView) };
}

export async function retirePrompt(ctx: PermCtx, id: string): Promise<void> {
  assertCanManageTranslations(ctx);
  const template = await db.query.translationPromptTemplates.findFirst({
    where: eq(schema.translationPromptTemplates.id, id),
  });
  if (!template) throw new DomainError('TRANSLATION_NOT_FOUND', 'Style not found');
  await db
    .update(schema.translationPromptTemplates)
    .set({ retiredAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.translationPromptTemplates.id, id));
}
