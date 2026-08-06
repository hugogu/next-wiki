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
  const binaryString = atob(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Attach a file to a page. Requires the credential to hold the dedicated
 * `attachments` API key scope (independent of create/edit) plus read access
 * to the target page — the wiki refuses the call otherwise, surfacing the
 * reason in the thrown error (spec FR-007/FR-007a).
 */
export async function attachFile(client: WikiApiClient, args: AttachFileInput) {
  const bytes = base64ToUint8Array(args.fileBase64);
  const mimeType = args.mimeType ?? 'application/octet-stream';
  const file = new File([bytes as BlobPart], args.fileName, { type: mimeType });

  const response = await client.attachFile(args.pageId, file);
  return attachFileResponse(response);
}
