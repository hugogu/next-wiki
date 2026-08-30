import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WikiApiClient } from '../api-client';
import { uploadImageResponse } from '../shapes';

/**
 * Hard ceiling on decoded upload size. Mirrors the web tier default
 * (`CONTENT_ASSET_MAX_BYTES` in `apps/web/src/server/config.ts`) so a
 * client cannot bypass the cap by choosing a different transport.
 *
 * To bump both at once, set both env vars:
 *   - web: `CONTENT_ASSET_MAX_BYTES` (apps/web/.env)
 *   - mcp:  `NEXT_WIKI_MCP_UPLOAD_MAX_BYTES` (this package)
 */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function getMaxBytes(): number {
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
async function getAllowedDirs(): Promise<string[]> {
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

export const uploadImageSchema = {
  imageBase64: z
    .string()
    .optional()
    .describe(
      'Base64-encoded image bytes. Mutually exclusive with filePath.',
    ),
  filePath: z
    .string()
    .optional()
    .describe(
      'Server-side filesystem path to read from. Must resolve (via fs.realpath) to a regular file inside NEXT_WIKI_MCP_FILE_ALLOW_DIRS (default: server cwd). Mutually exclusive with imageBase64.',
    ),
  filename: z
    .string()
    .optional()
    .describe('Original filename for content-type inference'),
  mimeType: z
    .enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
    .optional()
    .describe('MIME type; inferred from filename if omitted'),
};
export type UploadImageInput = z.infer<z.ZodObject<typeof uploadImageSchema>>;

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function inferMimeType(filename?: string): string {
  if (!filename) return 'image/png';
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function isWithinAllowedDir(real: string, allowed: string): boolean {
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
 *
 * Throws Error with a descriptive, client-actionable message on any failure.
 */
async function readFromPath(filePath: string): Promise<Uint8Array> {
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

  const buf = await fs.readFile(real);
  return new Uint8Array(buf);
}

export async function uploadImage(client: WikiApiClient, args: UploadImageInput) {
  const sources = [args.imageBase64, args.filePath].filter(s => s !== undefined);
  if (sources.length !== 1) {
    throw new Error(
      'Must provide exactly one of imageBase64 or filePath (got ' +
        sources.length +
        ').',
    );
  }

  let bytes: Uint8Array;
  if (args.filePath !== undefined) {
    bytes = await readFromPath(args.filePath);
  } else {
    bytes = base64ToUint8Array(args.imageBase64!);
  }

  const mimeType = args.mimeType ?? inferMimeType(args.filename);
  const filename = args.filename ?? `image.${mimeType.split('/')[1]}`;
  const file = new File([bytes as BlobPart], filename, { type: mimeType });

  const response = await client.uploadImage(file);
  return uploadImageResponse(response);
}