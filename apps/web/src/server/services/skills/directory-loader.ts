import fs from 'node:fs/promises';
import path from 'node:path';
import { SKILL_LIMITS, type SkillRejectionReason } from '@next-wiki/shared';
import { logger } from '@/server/logger';
import {
  INSTRUCTION_FILE,
  classifyFile,
  contentTypeFor,
  isInsidePackage,
  isViewable,
  parseInstructionFile,
} from './package';

/**
 * Bounded discovery of host-installed skill packages (028, FR-025/FR-028/FR-029).
 *
 * Constitution P10 prohibits custom runtime filesystem discovery *unless the
 * feature spec defines a bounded registry and a testable loading contract*.
 * This module is that contract: every bound below is explicit, every rejection
 * carries a specific reason, and one bad package can never stop the scan or the
 * service.
 *
 * The scan is deliberately shallow and small enough to stay a synchronous admin
 * request rather than a background job.
 */

export type LoadedSkillFile = {
  path: string;
  kind: ReturnType<typeof classifyFile>;
  contentType: string;
  byteSize: number;
  viewable: boolean;
  /** Absolute path, kept so file reads can re-validate containment. */
  absolutePath: string;
};

export type LoadedSkillPackage = {
  name: string;
  description: string;
  directory: string;
  /** The package root with symlinks resolved. Containment checks compare
   * against this rather than `directory`, because the skills root itself is
   * routinely reached through a symlink (a bind mount, or /tmp on macOS) and
   * comparing a resolved file path against an unresolved root would reject
   * every file in the package. */
  realDirectory: string;
  files: LoadedSkillFile[];
};

export type LoadRejection = {
  reason: SkillRejectionReason;
  detail: string;
  name: string | null;
  directory: string;
};

export type DirectoryScan = {
  packages: LoadedSkillPackage[];
  rejected: LoadRejection[];
  /** Present when the root is unconfigured, missing, or unreadable. Not an
   * error: the service runs on built-in and admin-authored skills alone. */
  notice: string | null;
  readable: boolean;
  scannedAt: Date;
};

export async function scanSkillsDirectory(root: string | null): Promise<DirectoryScan> {
  const scannedAt = new Date();
  if (!root) {
    return {
      packages: [],
      rejected: [],
      notice: 'No skills directory is configured. Set SKILLS_BASE_PATH to load host-installed skills.',
      readable: false,
      scannedAt,
    };
  }
  let entries: string[];
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    entries = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    logger.info('skills directory not readable', { root, code });
    return {
      packages: [],
      rejected: [],
      notice:
        code === 'ENOENT'
          ? `The configured skills directory does not exist. Mount a directory at ${root} to load host-installed skills.`
          : `The configured skills directory could not be read (${code ?? 'unknown error'}). Check that ${root} is readable by the service.`,
      readable: false,
      scannedAt,
    };
  }

  const packages: LoadedSkillPackage[] = [];
  const rejected: LoadRejection[] = [];
  // Beyond the bound, further packages are reported rather than silently
  // ignored — a skill that vanished without explanation is worse than one that
  // says why it was skipped.
  const considered = entries.slice(0, SKILL_LIMITS.maxPackagesPerScan);
  for (const overflow of entries.slice(SKILL_LIMITS.maxPackagesPerScan)) {
    rejected.push({
      reason: 'too_many_files',
      detail: `The scan is limited to ${SKILL_LIMITS.maxPackagesPerScan} packages. Remove unused skills from the mount.`,
      name: null,
      directory: path.join(root, overflow),
    });
  }

  for (const entry of considered) {
    const directory = path.join(root, entry);
    const loaded = await loadPackage(directory);
    if ('reason' in loaded) rejected.push(loaded);
    else packages.push(loaded);
  }
  return { packages, rejected, notice: null, readable: true, scannedAt };
}

async function loadPackage(directory: string): Promise<LoadedSkillPackage | LoadRejection> {
  const reject = (reason: SkillRejectionReason, detail: string, name: string | null = null) => ({
    reason,
    detail,
    name,
    directory,
  });
  const realDirectory = await fs.realpath(directory).catch(() => directory);

  let instructionSource: string;
  try {
    const instructionPath = path.join(directory, INSTRUCTION_FILE);
    const stat = await fs.lstat(instructionPath);
    // A symlinked instruction file is the easiest way to point the loader at
    // something outside the package, so resolve before reading.
    if (stat.isSymbolicLink()) {
      const real = await fs.realpath(instructionPath);
      if (!isInsidePackage(realDirectory, real)) {
        return reject('path_escape', `${INSTRUCTION_FILE} is a symbolic link pointing outside the package.`);
      }
    }
    if (stat.size > SKILL_LIMITS.maxFileBytes) {
      return reject('too_large', `${INSTRUCTION_FILE} exceeds ${SKILL_LIMITS.maxFileBytes} bytes.`);
    }
    instructionSource = await fs.readFile(instructionPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return reject(
        'missing_instruction_file',
        `The package has no ${INSTRUCTION_FILE}. Add one declaring "name" and "description" in YAML frontmatter.`,
      );
    }
    return reject('unreadable', `The package could not be read (${code ?? 'unknown error'}).`);
  }

  const parsed = parseInstructionFile(instructionSource);
  if (!parsed.ok) return reject(parsed.error.reason, parsed.error.detail);

  const files: LoadedSkillFile[] = [];
  let totalBytes = 0;
  const walk = async (current: string, prefix: string): Promise<LoadRejection | null> => {
    let dirents;
    try {
      dirents = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return reject('unreadable', `A directory inside the package could not be read (${code ?? 'unknown error'}).`, parsed.value.name);
    }
    for (const dirent of [...dirents].sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(current, dirent.name);
      const relativePath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isSymbolicLink()) {
        // Follow it once and drop anything that lands outside the package
        // rather than rejecting the whole skill for one stray link.
        const real = await fs.realpath(absolutePath).catch(() => null);
        if (!real || !isInsidePackage(realDirectory, real)) {
          logger.info('skipped skill file resolving outside its package', { relativePath });
          continue;
        }
      }
      if (dirent.isDirectory()) {
        const failure = await walk(absolutePath, relativePath);
        if (failure) return failure;
        continue;
      }
      if (!dirent.isFile()) continue;
      if (files.length >= SKILL_LIMITS.maxFilesPerPackage) {
        return reject(
          'too_many_files',
          `The package has more than ${SKILL_LIMITS.maxFilesPerPackage} files.`,
          parsed.value.name,
        );
      }
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat) continue;
      totalBytes += stat.size;
      if (totalBytes > SKILL_LIMITS.maxPackageBytes) {
        return reject(
          'too_large',
          `The package exceeds ${SKILL_LIMITS.maxPackageBytes} bytes in total.`,
          parsed.value.name,
        );
      }
      files.push({
        path: relativePath,
        kind: classifyFile(relativePath),
        contentType: contentTypeFor(relativePath),
        byteSize: stat.size,
        viewable: isViewable(relativePath, stat.size),
        absolutePath,
      });
    }
    return null;
  };

  const failure = await walk(directory, '');
  if (failure) return failure;

  return {
    name: parsed.value.name,
    description: parsed.value.description,
    directory,
    realDirectory,
    files,
  };
}

/**
 * Read one file from a directory-sourced package. Containment is re-validated
 * here rather than trusted from the scan, because the caller supplies the path.
 */
export async function readDirectorySkillFile(
  pkg: Pick<LoadedSkillPackage, 'realDirectory'>,
  file: LoadedSkillFile,
): Promise<string | null> {
  if (!file.viewable) return null;
  const real = await fs.realpath(file.absolutePath).catch(() => null);
  // Re-validated here rather than trusted from the scan, because the caller
  // supplies the path and the filesystem may have changed since.
  if (!real || !isInsidePackage(pkg.realDirectory, real)) return null;
  return fs.readFile(real, 'utf8');
}
