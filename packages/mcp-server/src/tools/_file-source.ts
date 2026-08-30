import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Shared defensive filesystem-read helpers for the `filePath` source of
 * `upload_image` and `attach_file` MCP tools.
 *
 * Threat model: the agent and the MCP server run as the same user, and the
 * allow-list directories are paths the user has explicitly trusted. The
 * checks below defend against accidental reads (path traversal, symlink
 * escape to outside the allow-list, oversized files, non-regular files)
 * and against a malicious local actor in an allowed dir racing the read
 * (TOCTOU).
 */

/**
 * Hard ceiling on decoded size. Mirrors the web tier default
 * (`CONTENT_ASSET_MAX_BYTES` in `apps/web/src/server/config.ts`) so a
 * client cannot bypass the cap by choosing a different transport.
 *
 * To bump both at once, set both env vars:
 *   - web: `CONTENT_ASSET_MAX_BYTES` (apps/web/.env)
 *   - mcp:  `NEXT_WIKI_MCP_UPLOAD_MAX_BYTES` (this package)
 */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function getMaxBytes(): number {
  const env = process.env.NEXT_WIKI_MCP_UPLOAD_MAX_BYTES;
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

/**
 * Colon-separated list of directory paths the MCP server is allowed to read
 * from when the `filePath` source is used. Each path is canonicalised via
 * `fs.realpath` (with `path.resolve` as a fallback when the directory does
 * not yet exist, so entries like `/nonexistent` still parse) so that both
 * sides of the `isWithinAllowedDir` comparison are in the same form.
 *
 * This matters on systems where `/tmp` is a symlink (macOS: `/tmp ->
 * /private/tmp`); without realpath-canonicalisation of allow-dirs, a file
 * under `/tmp` would have a realpath of `/private/tmp/...` and fail the
 * `startsWith` check against the unresolved `/tmp` allow-dir.
 *
 * Defaults to the server's working directory. Extend via env var if the
 * agent's scratch space lives elsewhere:
 *   NEXT_WIKI_MCP_FILE_ALLOW_DIRS="/home/hugo/.openclaw/workspace:/tmp"
 */
export async function getAllowedDirs(): Promise<string[]> {
  const env = process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS;
  const rawDirs =
    env && env.trim().length > 0
      ? env.split(':').map(p => p.trim()).filter(Boolean)
      : [process.cwd()];
  return Promise.all(
    rawDirs.map(async p => {
      const resolved = path.resolve(p);
      try {
        return await fs.realpath(resolved);
      } catch {
        // Directory does not exist (yet); fall back to the resolved path
        // so the entry still parses. Realpath will fail closed later when
        // a real file is checked against it.
        return resolved;
      }
    }),
  );
}

export function isWithinAllowedDir(real: string, allowed: string): boolean {
  return real === allowed || real.startsWith(allowed + path.sep);
}

/**
 * Read bytes from a local file, enforcing:
 *   1. file exists and resolves via realpath (no dangling symlinks)
 *   2. resolved path is inside an allowed directory
 *      (cwd by default, configurable via env var)
 *   3. resolved path is a regular file (no directories, devices, sockets)
 *   4. file size does not exceed the configured cap (10 MB by default,
 *      mirroring the web tier)
 *   5. (TOCTOU) the path is re-verified immediately before the read, to
 *      narrow the race window between the initial checks and `readFile`.
 *
 * Throws Error with a descriptive, client-actionable message on any failure.
 */
export async function readFromPath(filePath: string): Promise<Uint8Array> {
  const abs = path.resolve(filePath);

  let real: string;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new Error(`filePath does not exist or cannot be resolved: ${filePath}`);
  }

  const allowedDirs = await getAllowedDirs();
  if (!allowedDirs.some(dir => isWithinAllowedDir(real, dir))) {
    throw new Error(
      `filePath resolves outside allowed directories: ${real} not in [${allowedDirs.join(', ')}]. ` +
        `Set NEXT_WIKI_MCP_FILE_ALLOW_DIRS (colon-separated absolute paths) to extend.`,
    );
  }

  const stat = await fs.stat(real);
  if (!stat.isFile()) {
    throw new Error(`filePath is not a regular file: ${real}`);
  }

  const maxBytes = getMaxBytes();
  if (stat.size > maxBytes) {
    throw new Error(
      `filePath exceeds ${maxBytes} bytes (got ${stat.size}). ` +
        `Bump NEXT_WIKI_MCP_UPLOAD_MAX_BYTES if you need larger uploads; ` +
        `the web tier CONTENT_ASSET_MAX_BYTES must be raised in lockstep.`,
    );
  }

  // TOCTOU guard: re-verify the path right before reading. A malicious
  // local actor in an allowed dir could swap a regular file for a symlink
  // to outside the allow-list (or for a larger file) between the checks
  // above and readFile. Re-realpath + re-stat narrows the window; the only
  // remaining race is between this re-stat and readFile itself, which is
  // narrow enough to be acceptable for this threat model (agent and MCP
  // server are the same user).
  const reReal = await fs.realpath(real);
  if (reReal !== real) {
    throw new Error(
      `filePath changed during read (symlink swap detected); refusing to proceed: ${filePath}`,
    );
  }
  const reStat = await fs.stat(reReal);
  if (!reStat.isFile() || reStat.size > maxBytes) {
    throw new Error(
      `filePath state changed during read (regular-file / size); refusing to proceed: ${filePath}`,
    );
  }

  const buf = await fs.readFile(reReal);
  return new Uint8Array(buf);
}