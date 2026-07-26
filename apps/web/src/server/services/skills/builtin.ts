import fs from 'node:fs/promises';
import path from 'node:path';
import { SKILL_LIMITS } from '@next-wiki/shared';
import { logger } from '@/server/logger';
import {
  INSTRUCTION_FILE,
  classifyFile,
  contentTypeFor,
  isViewable,
  parseInstructionFile,
} from './package';

/**
 * Skill packages shipped with the product (028, FR-039..FR-041).
 *
 * The list is explicit, not scanned: constitution P10 wants registration you
 * can find by reading an entry point. The package *contents* are real files on
 * disk so they are authored, diffed, and reviewed like the documents they are,
 * and so the shipped default is always recoverable after an admin edits it.
 */
export const BUILTIN_SKILL_PACKAGES = ['wiki-writer', 'wiki-tagger', 'wiki-linker'] as const;

export type BuiltinSkillName = (typeof BUILTIN_SKILL_PACKAGES)[number];

export type BuiltinSkillFile = {
  path: string;
  kind: ReturnType<typeof classifyFile>;
  contentType: string;
  byteSize: number;
  viewable: boolean;
  content: string;
};

export type BuiltinSkill = {
  name: string;
  description: string;
  files: BuiltinSkillFile[];
};

/**
 * Where the shipped packages live at runtime.
 *
 * The container image copies `apps/web/src` wholesale, and `pnpm dev` runs from
 * `apps/web`, so the same relative path resolves from either of two working
 * directories. Both candidates are tried rather than assuming one, because
 * guessing wrong here would mean the built-in skills silently disappear in
 * production while working locally.
 */
const CANDIDATE_ROOTS = [
  'src/server/skills/builtin',
  'apps/web/src/server/skills/builtin',
];

let cachedRoot: string | null | undefined;

async function resolveRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot;
  for (const candidate of CANDIDATE_ROOTS) {
    const absolute = path.resolve(process.cwd(), candidate);
    const stat = await fs.stat(absolute).catch(() => null);
    if (stat?.isDirectory()) {
      cachedRoot = absolute;
      return cachedRoot;
    }
  }
  logger.warn('built-in skill packages not found on disk', { cwd: process.cwd() });
  cachedRoot = null;
  return null;
}

/** Test seam: forget the resolved root so a test can point at a fixture. */
export function resetBuiltinRootCache(): void {
  cachedRoot = undefined;
}

/**
 * Load every shipped package. A package that fails to load is logged and
 * skipped rather than thrown: a broken built-in must not take the service down
 * or hide the skills that are fine.
 */
export async function loadBuiltinSkills(): Promise<BuiltinSkill[]> {
  const root = await resolveRoot();
  if (!root) return [];
  const skills: BuiltinSkill[] = [];
  for (const name of BUILTIN_SKILL_PACKAGES) {
    const loaded = await loadBuiltinSkill(path.join(root, name)).catch((error: unknown) => {
      logger.warn('built-in skill package failed to load', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (loaded) skills.push(loaded);
  }
  return skills;
}

async function loadBuiltinSkill(directory: string): Promise<BuiltinSkill | null> {
  const instruction = await fs
    .readFile(path.join(directory, INSTRUCTION_FILE), 'utf8')
    .catch(() => null);
  if (instruction === null) return null;
  const parsed = parseInstructionFile(instruction);
  if (!parsed.ok) {
    logger.warn('built-in skill package has invalid frontmatter', {
      directory: path.basename(directory),
      detail: parsed.error.detail,
    });
    return null;
  }
  const files: BuiltinSkillFile[] = [];
  const walk = async (current: string, prefix: string): Promise<void> => {
    const dirents = await fs.readdir(current, { withFileTypes: true });
    for (const dirent of [...dirents].sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, dirent.name);
      const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (files.length >= SKILL_LIMITS.maxFilesPerPackage) break;
      const content = await fs.readFile(absolute, 'utf8');
      const byteSize = Buffer.byteLength(content);
      files.push({
        path: relative,
        kind: classifyFile(relative),
        contentType: contentTypeFor(relative),
        byteSize,
        viewable: isViewable(relative, byteSize),
        content,
      });
    }
  };
  await walk(directory, '');
  return { name: parsed.value.name, description: parsed.value.description, files };
}
