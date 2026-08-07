import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const downloadAttachmentSchema = {
  attachmentId: z.string().uuid().describe('Id of the attachment to download'),
};
export type DownloadAttachmentInput = z.infer<z.ZodObject<typeof downloadAttachmentSchema>>;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Download an attachment's content. Needs only the credential's existing
 * read access to the attachment's page — no independent scope (spec
 * FR-003b). MCP tool results are text/JSON, so the bytes are base64-encoded
 * in the response (mirrors how `upload_image`/`attach_file` take base64 in
 * reverse).
 */
export async function downloadAttachment(client: WikiApiClient, args: DownloadAttachmentInput) {
  const { fileName, contentType, bytes } = await client.downloadAttachment(args.attachmentId);
  return {
    fileName,
    contentType,
    sizeBytes: bytes.length,
    bytesBase64: uint8ArrayToBase64(bytes),
  };
}
