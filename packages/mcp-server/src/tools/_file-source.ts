import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Shared defensive filesystem-read helpers for the `filePath` source of the
 * `upload_image` and `attach_file` MCP tools and, as text (see
 * `readTextFromPath`), of `create_page` and `save_draft`.
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

const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt'];

/** Upper bound for a page body read from a file; far above any real page. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** True when the operator listed directories in NEXT_WIKI_MCP_FILE_ALLOW_DIRS. */
export function hasExplicitAllowedDirs(): boolean {
  return (process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS ?? '').trim().length > 0;
}

/**
 * Read a page body (Markdown or plain text) from a file on the server host.
 *
 * Held to more than `readFromPath`, because the result becomes searchable and
 * possibly published text, and the server may be able to read files the agent
 * cannot:
 *   - the path must be absolute. `~` is deliberately not expanded: the server
 *     can run as a different user than the agent, so it could silently resolve
 *     to the wrong home directory, and a relative path resolves against a
 *     working directory the agent does not know;
 *   - the allow-list must be set explicitly, with no default to the server cwd;
 *   - only .md, .markdown and .txt files;
 *   - non-empty, at most MAX_TEXT_BYTES, valid UTF-8 without NUL bytes.
 */
export async function readTextFromPath(filePath: string): Promise<string> {
  if (!path.isAbsolute(filePath)) {
    throw new Error(
      `filePath must be an absolute path (got "${filePath}"). "~" and relative paths are not expanded: ` +
        `the MCP server may run as a different user, or from a different directory, than the agent.`,
    );
  }
  if (!TEXT_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
    throw new Error(
      `filePath must be a Markdown or plain-text file (${TEXT_EXTENSIONS.join(', ')}): ${filePath}`,
    );
  }
  if (!hasExplicitAllowedDirs()) {
    throw new Error(
      'Reading a page body from a file is off until NEXT_WIKI_MCP_FILE_ALLOW_DIRS lists the directories ' +
        'the MCP server may read (colon-separated absolute paths).',
    );
  }

  const bytes = await readFromPath(filePath);
  if (bytes.byteLength === 0) {
    throw new Error(`filePath is empty: ${filePath}`);
  }
  if (bytes.byteLength > MAX_TEXT_BYTES) {
    throw new Error(
      `filePath is ${bytes.byteLength} bytes; a page body read from a file is limited to ${MAX_TEXT_BYTES} bytes: ${filePath}`,
    );
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`filePath is not valid UTF-8 text: ${filePath}`);
  }
  if (text.includes('\u0000')) {
    throw new Error(`filePath looks binary (contains NUL bytes): ${filePath}`);
  }
  return text;
}