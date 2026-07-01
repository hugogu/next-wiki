import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { uploadImageResponse } from '../shapes';

export const uploadImageSchema = {
  imageBase64: z.string().min(1).describe('Base64-encoded image bytes'),
  filename: z.string().optional().describe('Original filename for content-type inference'),
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
  const bytes = base64ToUint8Array(args.imageBase64);
  const mimeType = args.mimeType ?? inferMimeType(args.filename);
  const filename = args.filename ?? `image.${mimeType.split('/')[1]}`;
  const file = new File([bytes as BlobPart], filename, { type: mimeType });

  const response = await client.uploadImage(file);
  return uploadImageResponse(response);
}
