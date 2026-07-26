import { and, eq, isNull } from 'drizzle-orm';
import {
  SKILL_LIMITS,
  type SkillFileKind,
  type SkillSource,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import {
  INSTRUCTION_FILE,
  buildInstructionFile,
  classifyFile,
  contentTypeFor,
  isViewable,
  parseInstructionFile,
  safeRelativePath,
} from './package';

/**
 * Persistence for editable skills (028, FR-032..FR-035, clarification Q3).
 *
 * Rows exist only for admin-authored skills and for overrides of built-in ones.
 * Directory-sourced skills are never written here — the mount is read-only, and
 * the service must never write to it, so a `:ro` bind is correct rather than
 * merely tolerated (FR-026a).
 *
 * Every save appends an immutable revision. `revision` on the current row is
 * also the optimistic-concurrency token: a write carries the revision it read,
 * and a mismatch is rejected rather than silently overwriting a colleague.
 */

export type StoredSkill = typeof schema.skills.$inferSelect;
export type StoredSkillFile = typeof schema.skillFiles.$inferSelect;

export type SkillWithFiles = { skill: StoredSkill; files: StoredSkillFile[] };

export async function listStoredSkills(): Promise<SkillWithFiles[]> {
  const rows = await db
    .select()
    .from(schema.skills)
    .where(isNull(schema.skills.deletedAt))
    .orderBy(schema.skills.createdAt);
  if (rows.length === 0) return [];
  const files = await db.select().from(schema.skillFiles);
  const bySkill = new Map<string, StoredSkillFile[]>();
  for (const file of files) {
    const list = bySkill.get(file.skillId) ?? [];
    list.push(file);
    bySkill.set(file.skillId, list);
  }
  return rows.map((skill) => ({
    skill,
    files: (bySkill.get(skill.id) ?? []).sort((a, b) => a.path.localeCompare(b.path)),
  }));
}

export async function findStoredSkill(name: string): Promise<SkillWithFiles | null> {
  const skill = await db.query.skills.findFirst({
    where: and(eq(schema.skills.name, name), isNull(schema.skills.deletedAt)),
  });
  if (!skill) return null;
  const files = await db
    .select()
    .from(schema.skillFiles)
    .where(eq(schema.skillFiles.skillId, skill.id));
  return { skill, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

/** Create an admin-authored skill seeded with a valid instruction file. */
export async function createManagedSkill(input: {
  name: string;
  description: string;
  actorUserId: string | null;
}): Promise<SkillWithFiles> {
  const body = [
    `# ${input.name}`,
    '',
    '## When to use',
    '',
    'Describe the requests this skill should handle.',
    '',
    '## Procedure',
    '',
    '1. ',
  ].join('\n');
  const content = buildInstructionFile({
    name: input.name,
    description: input.description,
    body,
  });
  return db.transaction(async (tx) => {
    const [skill] = await tx
      .insert(schema.skills)
      .values({
        name: input.name,
        source: 'managed',
        description: input.description,
        createdBy: input.actorUserId,
      })
      .returning();
    if (!skill) throw new DomainError('CONFLICT', 'Skill could not be created');
    await insertFile(tx, skill.id, INSTRUCTION_FILE, content, input.actorUserId);
    const files = await tx
      .select()
      .from(schema.skillFiles)
      .where(eq(schema.skillFiles.skillId, skill.id));
    return { skill, files };
  });
}

/**
 * Ensure the override row for a built-in skill exists. Created lazily on the
 * first edit so an untouched built-in has no row at all — which is what makes
 * "reset to default" a delete rather than a restore-from-copy.
 */
export async function ensureBuiltinOverride(input: {
  name: string;
  description: string;
  actorUserId: string | null;
}): Promise<StoredSkill> {
  const existing = await db.query.skills.findFirst({
    where: and(eq(schema.skills.name, input.name), isNull(schema.skills.deletedAt)),
  });
  if (existing) {
    if (existing.source !== 'builtin') {
      throw new DomainError('SKILL_READ_ONLY', 'This skill is not a built-in override');
    }
    return existing;
  }
  const [created] = await db
    .insert(schema.skills)
    .values({
      name: input.name,
      source: 'builtin',
      description: input.description,
      createdBy: input.actorUserId,
    })
    .returning();
  if (!created) throw new DomainError('CONFLICT', 'Skill override could not be created');
  return created;
}

export type WriteFileResult = { path: string; revision: number; kind: SkillFileKind };

/**
 * Create or update one file. `expectedRevision` is mandatory for an existing
 * file: making the concurrency token optional would turn a silent overwrite
 * into the default, which is the behaviour FR-036 exists to prevent.
 */
export async function writeSkillFile(input: {
  skillId: string;
  path: string;
  content: string;
  expectedRevision?: number;
  actorUserId: string | null;
}): Promise<WriteFileResult> {
  const relativePath = safeRelativePath(input.path);
  if (!relativePath) throw new DomainError('SKILL_PATH_INVALID', 'Invalid skill file path');
  if (Buffer.byteLength(input.content) > SKILL_LIMITS.maxFileBytes) {
    throw new DomainError('SKILL_FILE_TOO_LARGE', 'Skill file exceeds the size limit');
  }
  // Writing the instruction file is the one edit that can invalidate the whole
  // package, so it is validated before anything is persisted (FR-033).
  if (relativePath === INSTRUCTION_FILE) {
    const parsed = parseInstructionFile(input.content);
    if (!parsed.ok) throw new DomainError('SKILL_INVALID', parsed.error.detail);
  }
  return db.transaction(async (tx) => {
    const existing = await tx.query.skillFiles.findFirst({
      where: and(eq(schema.skillFiles.skillId, input.skillId), eq(schema.skillFiles.path, relativePath)),
    });
    if (existing) {
      if (input.expectedRevision === undefined) {
        throw new DomainError('BAD_REQUEST', 'A revision is required when updating an existing file');
      }
      if (existing.revision !== input.expectedRevision) {
        throw new DomainError(
          'SKILL_FILE_CONFLICT',
          `This file was changed by someone else (current revision ${existing.revision})`,
        );
      }
      const revision = existing.revision + 1;
      await tx
        .update(schema.skillFiles)
        .set({
          content: input.content,
          byteSize: Buffer.byteLength(input.content),
          revision,
          updatedBy: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(schema.skillFiles.id, existing.id));
      await tx.insert(schema.skillFileRevisions).values({
        skillId: input.skillId,
        path: relativePath,
        revision,
        content: input.content,
        operation: 'update',
        createdBy: input.actorUserId,
      });
      await syncDescription(tx, input.skillId, relativePath, input.content);
      return { path: relativePath, revision, kind: classifyFile(relativePath) };
    }
    await insertFile(tx, input.skillId, relativePath, input.content, input.actorUserId);
    await syncDescription(tx, input.skillId, relativePath, input.content);
    return { path: relativePath, revision: 1, kind: classifyFile(relativePath) };
  });
}

export async function deleteSkillFile(input: {
  skillId: string;
  path: string;
  actorUserId: string | null;
}): Promise<void> {
  const relativePath = safeRelativePath(input.path);
  if (!relativePath) throw new DomainError('SKILL_PATH_INVALID', 'Invalid skill file path');
  if (relativePath === INSTRUCTION_FILE) {
    throw new DomainError('SKILL_INVALID', `${INSTRUCTION_FILE} cannot be deleted`);
  }
  await db.transaction(async (tx) => {
    const existing = await tx.query.skillFiles.findFirst({
      where: and(eq(schema.skillFiles.skillId, input.skillId), eq(schema.skillFiles.path, relativePath)),
    });
    if (!existing) throw new DomainError('SKILL_FILE_NOT_FOUND', 'Skill file not found');
    await tx.delete(schema.skillFiles).where(eq(schema.skillFiles.id, existing.id));
    await tx.insert(schema.skillFileRevisions).values({
      skillId: input.skillId,
      path: relativePath,
      revision: existing.revision + 1,
      content: '',
      operation: 'delete',
      createdBy: input.actorUserId,
    });
  });
}

/** Soft-delete an admin-authored skill, or reset a built-in one by dropping its
 * override. Revisions are retained either way. */
export async function softDeleteSkill(skillId: string): Promise<void> {
  await db
    .update(schema.skills)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.skills.id, skillId));
}

// ---- Settings ---------------------------------------------------------------

export type SkillSetting = typeof schema.skillSettings.$inferSelect;

export async function listSkillSettings(): Promise<Map<string, SkillSetting>> {
  const rows = await db.select().from(schema.skillSettings);
  return new Map(rows.map((row) => [row.name, row]));
}

export async function setSkillEnabled(input: {
  name: string;
  enabled: boolean;
  actorUserId: string | null;
}): Promise<void> {
  await db
    .insert(schema.skillSettings)
    .values({ name: input.name, enabled: input.enabled, updatedBy: input.actorUserId })
    .onConflictDoUpdate({
      target: schema.skillSettings.name,
      set: { enabled: input.enabled, updatedBy: input.actorUserId, updatedAt: new Date() },
    });
}

/** Record that a skill was loaded into a turn. Best-effort: observability must
 * never fail a user's request. */
export async function touchSkillUsage(name: string, defaultEnabled: boolean): Promise<void> {
  await db
    .insert(schema.skillSettings)
    .values({ name, enabled: defaultEnabled, lastUsedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.skillSettings.name,
      set: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);
}

// ---- Internals --------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertFile(
  tx: Tx,
  skillId: string,
  relativePath: string,
  content: string,
  actorUserId: string | null,
): Promise<void> {
  const byteSize = Buffer.byteLength(content);
  await tx.insert(schema.skillFiles).values({
    skillId,
    path: relativePath,
    kind: classifyFile(relativePath),
    content,
    contentType: contentTypeFor(relativePath),
    byteSize,
    revision: 1,
    updatedBy: actorUserId,
  });
  await tx.insert(schema.skillFileRevisions).values({
    skillId,
    path: relativePath,
    revision: 1,
    content,
    operation: 'create',
    createdBy: actorUserId,
  });
}

/** Keep the row's description in step with the instruction file, so the
 * catalogue the model sees never disagrees with the file an admin edited. */
async function syncDescription(
  tx: Tx,
  skillId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (relativePath !== INSTRUCTION_FILE) return;
  const parsed = parseInstructionFile(content);
  if (!parsed.ok) return;
  await tx
    .update(schema.skills)
    .set({ description: parsed.value.description, updatedAt: new Date() })
    .where(eq(schema.skills.id, skillId));
}

/** Shape a stored file for presentation. */
export function toFileView(file: StoredSkillFile) {
  return {
    path: file.path,
    kind: file.kind,
    contentType: file.contentType,
    byteSize: file.byteSize,
    viewable: isViewable(file.path, file.byteSize),
    revision: file.revision,
  };
}

export function sourceOf(skill: StoredSkill): SkillSource {
  return skill.source;
}
