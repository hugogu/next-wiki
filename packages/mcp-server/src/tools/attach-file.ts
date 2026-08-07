import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { attachFileResponse } from '../shapes';

export const attachFileSchema = {
  pageId: z.string().uuid().describe('Id of the page to attach the file to'),
  fileBase64: z.string().min(1).describe('Base64-encoded file bytes'),
  fileName: z.string().min(1).describe('Original file name, e.g. "report.pdf"'),
  mimeType: z.string().optional().describe('MIME type; inferred from the file name if omitted'),
};
export type AttachFileInput = z.infer<z.ZodObject<typeof attachFileSchema>>;

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/^data:[^;]+;base64,/, '');
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

/** Matches the server's fixed attachment allowlist (FR-010). A few of these
 * types have no reliable magic number and are accepted purely on the
 * declared Content-Type (text/plain, text/markdown, text/csv), so guessing
 * wrong here means the upload gets rejected even though the bytes are fine. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

function inferMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  return (ext && EXTENSION_MIME_TYPES[ext]) || 'application/octet-stream';
}

/**
 * Attach a file to a page. Requires the credential to hold the dedicated
 * `attachments` API key scope (independent of create/edit) plus read access
 * to the target page — the wiki refuses the call otherwise, surfacing the
 * reason in the thrown error (spec FR-007/FR-007a).
 */
export async function attachFile(client: WikiApiClient, args: AttachFileInput) {
  const bytes = base64ToUint8Array(args.fileBase64);
  const mimeType = args.mimeType ?? inferMimeType(args.fileName);
  const file = new File([bytes as BlobPart], args.fileName, { type: mimeType });

  const response = await client.attachFile(args.pageId, file);
  return attachFileResponse(response);
}
