import { z } from 'zod';
import * as path from 'node:path';
import type { WikiApiClient } from '../api-client';
import { uploadImageResponse } from '../shapes';
import { readFromPath } from './_file-source';

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

  const effectiveFilename =
    args.filename
    ?? (args.filePath ? path.basename(args.filePath) : 'image.png');
  const mimeType = args.mimeType ?? inferMimeType(effectiveFilename);
  const file = new File([bytes as BlobPart], effectiveFilename, { type: mimeType });

  const response = await client.uploadImage(file);
  return uploadImageResponse(response);
}