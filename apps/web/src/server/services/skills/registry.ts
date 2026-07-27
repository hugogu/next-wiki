import { cache } from 'react';
import {
  type SkillCatalogue,
  type SkillDirectoryStatus,
  type SkillFileView,
  type SkillRejection,
  type SkillSource,
  type SkillSummary,
} from '@next-wiki/shared';
import { env } from '@/server/config';
import { logger } from '@/server/logger';
import { INSTRUCTION_FILE, isViewable } from './package';
import { loadBuiltinSkills, type BuiltinSkill } from './builtin';
import {
  readDirectorySkillFile,
  scanSkillsDirectory,
  type DirectoryScan,
  type LoadedSkillPackage,
} from './directory-loader';
import { listSkillSettings, listStoredSkills, touchSkillUsage, type SkillWithFiles } from './store';

/**
 * The bounded skill registry (028, FR-010..FR-016).
 *
 * Three sources are merged in a fixed order and the first claim on a name wins;
 * every later claimant becomes a `duplicate_name` rejection naming the winner.
 * Duplicates are forbidden outright rather than shadowed so that no user or
 * model can ever act on a skill different from the one they meant.
 *
 * The registry is a module-cached value with one explicit invalidation entry
 * point, not a mutable global: nothing outside this module can write to it, and
 * it is built lazily so a slow or missing mount can never block startup.
 */

export type RegistryEntry = {
  name: string;
  description: string;
  source: SkillSource;
  editable: boolean;
  /** A built-in whose shipped content has been overridden. */
  overridden: boolean;
  files: SkillFileView[];
  /** Resolve one file's text. Null when the file is binary, oversized, or gone. */
  readFile: (path: string) => Promise<string | null>;
};

export type Registry = {
  entries: Map<string, RegistryEntry>;
  rejected: SkillRejection[];
  directory: SkillDirectoryStatus;
};

/**
 * Memoized for the duration of one request, not across requests.
 *
 * A module-level cache looked cheaper but was wrong: Next.js gives route
 * handlers and server components separate module instances, so a write that
 * invalidated the route handler's copy left the page rendering from a stale
 * one — an admin would save a skill and the catalogue would keep insisting
 * nothing had changed. Per-request memoization removes that class of bug
 * entirely and still collapses the several calls a single request makes.
 *
 * Rebuilding per request is affordable because discovery is bounded by
 * construction (see SKILL_LIMITS): at most 100 packages of at most 16 files.
 */
export const getSkillRegistry = cache(async (): Promise<Registry> => buildRegistry());

async function buildRegistry(): Promise<Registry> {
  const [builtins, stored, scan] = await Promise.all([
    loadBuiltinSkills(),
    listStoredSkills(),
    scanSkillsDirectory(env.SKILLS_BASE_PATH || null),
  ]);

  const entries = new Map<string, RegistryEntry>();
  const rejected: SkillRejection[] = [];
  const claim = (entry: RegistryEntry, origin: { directory: string | null }) => {
    const incumbent = entries.get(entry.name);
    if (incumbent) {
      rejected.push({
        reason: 'duplicate_name',
        detail: `The name "${entry.name}" is already used by a ${sourceLabel(incumbent.source)} skill. Rename this package or remove the other one.`,
        name: entry.name,
        origin,
        conflictsWith: { name: incumbent.name, source: incumbent.source },
      });
      return;
    }
    entries.set(entry.name, entry);
  };

  const storedByName = new Map(stored.map((item) => [item.skill.name, item]));

  // 1. Built-ins, overlaid with their override row when one exists.
  for (const builtin of builtins) {
    const override = storedByName.get(builtin.name);
    const isOverride = override?.skill.source === 'builtin';
    claim(builtinEntry(builtin, isOverride ? override : null), { directory: null });
  }
  // 2. Admin-authored skills. Built-in override rows are consumed above.
  for (const item of stored) {
    if (item.skill.source === 'builtin') continue;
    claim(managedEntry(item), { directory: null });
  }
  // 3. Host-mounted packages, last, so a mount can never take a name from a
  //    skill that is already working.
  for (const pkg of scan.packages) {
    claim(directoryEntry(pkg), { directory: pkg.directory });
  }
  for (const rejection of scan.rejected) {
    rejected.push({
      reason: rejection.reason,
      detail: rejection.detail,
      name: rejection.name,
      origin: { directory: rejection.directory },
    });
  }

  logger.info('skill registry built', {
    skills: entries.size,
    rejected: rejected.length,
    directoryReadable: scan.readable,
  });

  return {
    entries,
    rejected,
    directory: directoryStatus(scan),
  };
}

/**
 * Instruction file first, then everything else alphabetically.
 *
 * Plain alphabetical ordering differed by source — `SKILL.md` led for built-ins
 * because uppercase sorts first in ASCII, but trailed `reference/…` for
 * directory packages under locale collation — and it left the file tree opening
 * on a reference document rather than the skill itself.
 */
function orderFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    if (a.path === INSTRUCTION_FILE) return -1;
    if (b.path === INSTRUCTION_FILE) return 1;
    return a.path.localeCompare(b.path);
  });
}

function sourceLabel(source: SkillSource): string {
  if (source === 'builtin') return 'built-in';
  if (source === 'managed') return 'custom';
  return 'directory';
}

function builtinEntry(builtin: BuiltinSkill, override: SkillWithFiles | null): RegistryEntry {
  // An override replaces individual files; anything it does not carry keeps the
  // shipped content, which is what makes editing one file a small act rather
  // than a fork of the whole package.
  const shipped = new Map(builtin.files.map((file) => [file.path, file.content]));
  const overridden = new Map((override?.files ?? []).map((file) => [file.path, file]));
  const paths = [...new Set([...shipped.keys(), ...overridden.keys()])];
  const files: SkillFileView[] = orderFiles(paths.map((path) => ({ path }))).map(({ path: filePath }) => {
    const stored = overridden.get(filePath);
    if (stored) {
      return {
        path: filePath,
        kind: stored.kind,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        viewable: isViewable(filePath, stored.byteSize),
        revision: stored.revision,
      };
    }
    const file = builtin.files.find((item) => item.path === filePath)!;
    return {
      path: file.path,
      kind: file.kind,
      contentType: file.contentType,
      byteSize: file.byteSize,
      viewable: file.viewable,
      // No revision until the file has been edited: there is nothing to
      // conflict with yet.
      revision: null,
    };
  });
  const description = overridden.has(INSTRUCTION_FILE)
    ? (override?.skill.description ?? builtin.description)
    : builtin.description;
  return {
    name: builtin.name,
    description,
    source: 'builtin',
    editable: true,
    overridden: Boolean(override),
    files,
    readFile: async (filePath) => {
      const stored = overridden.get(filePath);
      if (stored) return isViewable(filePath, stored.byteSize) ? stored.content : null;
      return shipped.get(filePath) ?? null;
    },
  };
}

function managedEntry(item: SkillWithFiles): RegistryEntry {
  const byPath = new Map(item.files.map((file) => [file.path, file]));
  return {
    name: item.skill.name,
    description: item.skill.description,
    source: 'managed',
    editable: true,
    overridden: false,
    files: orderFiles(
      item.files.map((file) => ({
        path: file.path,
        kind: file.kind,
        contentType: file.contentType,
        byteSize: file.byteSize,
        viewable: isViewable(file.path, file.byteSize),
        revision: file.revision,
      })),
    ),
    readFile: async (filePath) => {
      const file = byPath.get(filePath);
      if (!file) return null;
      return isViewable(file.path, file.byteSize) ? file.content : null;
    },
  };
}

function directoryEntry(pkg: LoadedSkillPackage): RegistryEntry {
  const byPath = new Map(pkg.files.map((file) => [file.path, file]));
  return {
    name: pkg.name,
    description: pkg.description,
    source: 'directory',
    // The mount is read-only and the service never writes to it, so a `:ro`
    // bind is correct rather than merely tolerated.
    editable: false,
    overridden: false,
    files: orderFiles(
      pkg.files.map((file) => ({
        path: file.path,
        kind: file.kind,
        contentType: file.contentType,
        byteSize: file.byteSize,
        viewable: file.viewable,
        revision: null,
      })),
    ),
    readFile: async (filePath) => {
      const file = byPath.get(filePath);
      if (!file) return null;
      return readDirectorySkillFile(pkg, file);
    },
  };
}

function directoryStatus(scan: DirectoryScan): SkillDirectoryStatus {
  return {
    configured: Boolean(env.SKILLS_BASE_PATH),
    basePath: env.SKILLS_BASE_PATH || null,
    hostPath: env.SKILLS_HOST_PATH ?? null,
    readable: scan.readable,
    notice: scan.notice,
    lastScannedAt: scan.scannedAt.toISOString(),
  };
}

// ---- Enablement -------------------------------------------------------------

/**
 * Every source defaults to enabled. Mounting a skill directory is already a
 * deliberate operator act performed with host access, and requiring a second
 * in-app click per skill would defeat the point of managing a shared library
 * with existing tooling. The risk is bounded: a skill confers no authority, so
 * an unwanted one degrades answer quality rather than opening a hole.
 */
const DEFAULT_ENABLED = true;

export type ResolvedSkill = SkillSummary & { entry: RegistryEntry };

export async function listSkills(): Promise<ResolvedSkill[]> {
  const [registry, settings] = await Promise.all([getSkillRegistry(), listSkillSettings()]);
  return [...registry.entries.values()]
    .map((entry) => {
      const setting = settings.get(entry.name);
      return {
        name: entry.name,
        description: entry.description,
        source: entry.source,
        editable: entry.editable,
        overridden: entry.overridden,
        enabled: setting?.enabled ?? DEFAULT_ENABLED,
        validationState: 'valid' as const,
        validationError: null,
        fileCount: entry.files.length,
        lastUsedAt: setting?.lastUsedAt?.toISOString() ?? null,
        entry,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findSkill(name: string): Promise<ResolvedSkill | null> {
  const skills = await listSkills();
  return skills.find((skill) => skill.name === name) ?? null;
}

/** The catalogue offered to Administrators. */
export async function getSkillCatalogue(): Promise<SkillCatalogue> {
  const [registry, skills] = await Promise.all([getSkillRegistry(), listSkills()]);
  return {
    skills: skills.map(({ entry: _entry, ...summary }) => summary),
    rejected: registry.rejected,
    directory: registry.directory,
  };
}

/** Enabled skills, in catalogue order. This is what the model is shown. */
export async function listEnabledSkills(): Promise<ResolvedSkill[]> {
  return (await listSkills()).filter((skill) => skill.enabled);
}

export async function recordSkillUsage(name: string): Promise<void> {
  await touchSkillUsage(name, DEFAULT_ENABLED);
}

export { DEFAULT_ENABLED as SKILL_DEFAULT_ENABLED };
