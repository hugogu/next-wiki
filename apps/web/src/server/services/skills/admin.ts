import type {
  SkillCatalogue,
  SkillDetail,
  SkillFileContent,
  SkillSummary,
} from '@next-wiki/shared';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { auditSkillChange } from '@/server/services/audit';
import { findSkill, getSkillCatalogue, type ResolvedSkill } from './registry';
import { INSTRUCTION_FILE, safeRelativePath } from './package';
import {
  createManagedSkill,
  deleteSkillFile,
  ensureBuiltinOverride,
  findStoredSkill,
  setSkillEnabled,
  softDeleteSkill,
  writeSkillFile,
} from './store';

/**
 * Administrator operations on skills (028).
 *
 * Every entry point re-checks `manage_ai` rather than trusting the route. The
 * registry is rebuilt per request, so a write is visible to the next read
 * without any cache bookkeeping to forget.
 */

function assertCanManageSkills(ctx: PermCtx): void {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access is required to manage skills');
  }
}

function assertCanViewSkills(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to view skills');
  }
}

async function audit(
  ctx: PermCtx,
  action: string,
  target: { name: string; path?: string },
): Promise<void> {
  // Auditing must never fail the operation it records.
  await auditSkillChange(getActorUserId(ctx), {
    action,
    name: target.name,
    path: target.path ?? null,
  }).catch(() => undefined);
}

export async function listSkillsForAdmin(ctx: PermCtx): Promise<SkillCatalogue> {
  assertCanViewSkills(ctx);
  return getSkillCatalogue();
}

/** Drop the registry entry, which carries closures that must not be serialised
 * into an API response. */
function toSummary(skill: ResolvedSkill): SkillSummary {
  const { entry, ...summary } = skill;
  void entry;
  return summary;
}

export async function getSkillForAdmin(ctx: PermCtx, name: string): Promise<SkillDetail> {
  assertCanManageSkills(ctx);
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  const { entry, ...summary } = skill;
  return { ...summary, files: entry.files };
}

export async function createSkill(
  ctx: PermCtx,
  input: { name: string; description: string },
): Promise<SkillSummary> {
  assertCanManageSkills(ctx);
  // Checked against the whole registry, not just stored rows, so the message
  // can name which source holds the name (FR-016).
  const existing = await findSkill(input.name);
  if (existing) {
    throw new DomainError(
      'SKILL_NAME_TAKEN',
      `The name "${input.name}" is already used by a ${existing.source} skill`,
    );
  }
  await createManagedSkill({ ...input, actorUserId: getActorUserId(ctx) });
  await audit(ctx, 'create', { name: input.name });
  const created = await findSkill(input.name);
  if (!created) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found after creation');
  return toSummary(created);
}

export async function setSkillEnabledForAdmin(
  ctx: PermCtx,
  name: string,
  enabled: boolean,
): Promise<SkillSummary> {
  assertCanManageSkills(ctx);
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  await setSkillEnabled({ name, enabled, actorUserId: getActorUserId(ctx) });
  await audit(ctx, enabled ? 'enable' : 'disable', { name });
  return { ...toSummary(skill), enabled };
}

export async function deleteSkill(ctx: PermCtx, name: string): Promise<void> {
  assertCanManageSkills(ctx);
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  if (skill.source !== 'managed') {
    throw new DomainError(
      'SKILL_READ_ONLY',
      skill.source === 'builtin'
        ? 'Built-in skills cannot be deleted. Reset it to its shipped default instead.'
        : 'Directory-sourced skills are read-only. Remove the package from the host instead.',
    );
  }
  const stored = await findStoredSkill(name);
  if (!stored) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  await softDeleteSkill(stored.skill.id);
  await audit(ctx, 'delete', { name });
}

/** Reset a built-in skill by dropping its override. Revisions are retained, so
 * the edit history survives the reset. */
export async function resetSkill(ctx: PermCtx, name: string): Promise<void> {
  assertCanManageSkills(ctx);
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  if (skill.source !== 'builtin') {
    throw new DomainError('SKILL_READ_ONLY', 'Only built-in skills can be reset to a default');
  }
  const stored = await findStoredSkill(name);
  if (!stored) return; // Never edited; already at its shipped default.
  await softDeleteSkill(stored.skill.id);
  await audit(ctx, 'reset', { name });
}

/**
 * Rebuild the catalogue from the mount. The registry is per-request, so this is
 * simply "read it again" — the value is that it is an explicit, audited action
 * an operator can point at after changing files on the host.
 */
export async function rescanSkills(ctx: PermCtx): Promise<SkillCatalogue> {
  assertCanManageSkills(ctx);
  const catalogue = await getSkillCatalogue();
  await audit(ctx, 'rescan', { name: 'directory' });
  return catalogue;
}

export async function readSkillFileForAdmin(
  ctx: PermCtx,
  name: string,
  filePath: string,
): Promise<SkillFileContent> {
  assertCanManageSkills(ctx);
  const relativePath = safeRelativePath(filePath);
  if (!relativePath) throw new DomainError('SKILL_PATH_INVALID', 'Invalid skill file path');
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  const file = skill.entry.files.find((item) => item.path === relativePath);
  if (!file) throw new DomainError('SKILL_FILE_NOT_FOUND', 'Skill file not found');
  if (!file.viewable) {
    throw new DomainError(
      'SKILL_FILE_NOT_VIEWABLE',
      'This file is binary or too large to display inline',
    );
  }
  const content = await skill.entry.readFile(relativePath);
  if (content === null) throw new DomainError('SKILL_FILE_NOT_FOUND', 'Skill file not found');
  return { ...file, content, editable: skill.editable };
}

export async function writeSkillFileForAdmin(
  ctx: PermCtx,
  name: string,
  filePath: string,
  input: { content: string; revision?: number },
): Promise<SkillFileContent> {
  assertCanManageSkills(ctx);
  const skill = await requireEditableSkill(name);
  // A built-in gets its override row on first write, so an untouched built-in
  // has no row at all and "reset" stays a delete rather than a restore.
  const stored =
    skill.source === 'builtin'
      ? await ensureBuiltinOverride({
          name: skill.name,
          description: skill.description,
          actorUserId: getActorUserId(ctx),
        })
      : (await findStoredSkill(name))?.skill;
  if (!stored) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  const result = await writeSkillFile({
    skillId: stored.id,
    path: filePath,
    content: input.content,
    expectedRevision: input.revision,
    actorUserId: getActorUserId(ctx),
  });
  await audit(ctx, 'file-write', { name, path: result.path });
  return readSkillFileForAdmin(ctx, name, result.path);
}

export async function deleteSkillFileForAdmin(
  ctx: PermCtx,
  name: string,
  filePath: string,
): Promise<void> {
  assertCanManageSkills(ctx);
  const skill = await requireEditableSkill(name);
  if (safeRelativePath(filePath) === INSTRUCTION_FILE) {
    throw new DomainError('SKILL_INVALID', `${INSTRUCTION_FILE} cannot be deleted`);
  }
  const stored = (await findStoredSkill(skill.name))?.skill;
  if (!stored) throw new DomainError('SKILL_FILE_NOT_FOUND', 'Skill file not found');
  await deleteSkillFile({
    skillId: stored.id,
    path: filePath,
    actorUserId: getActorUserId(ctx),
  });
  await audit(ctx, 'file-delete', { name, path: filePath });
}

async function requireEditableSkill(name: string) {
  const skill = await findSkill(name);
  if (!skill) throw new DomainError('SKILL_NOT_FOUND', 'Skill not found');
  if (!skill.editable) {
    throw new DomainError(
      'SKILL_READ_ONLY',
      'This skill is loaded from the read-only skills directory. Edit it on the host and rescan.',
    );
  }
  return skill;
}
