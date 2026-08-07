import { describe, expect, it, vi } from 'vitest';
import type { WikiApiClient } from '../api-client';
import { downloadAttachment } from './download-attachment';

describe('download_attachment', () => {
  const attachmentId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('base64-encodes the downloaded bytes without corruption', async () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255, 0x50, 0x4b, 0x03, 0x04]);
    const client = {
      downloadAttachment: vi.fn().mockResolvedValue({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        bytes: original,
      }),
    } as unknown as WikiApiClient;

    const result = await downloadAttachment(client, { attachmentId });

    expect(result.sizeBytes).toBe(original.length);
    expect(Buffer.from(result.bytesBase64, 'base64').equals(Buffer.from(original))).toBe(true);
  });

  it('round-trips a payload larger than a single chunk', async () => {
    const original = new Uint8Array(0x8000 * 2 + 1234);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const client = {
      downloadAttachment: vi.fn().mockResolvedValue({
        fileName: 'large.bin',
        contentType: 'application/octet-stream',
        bytes: original,
      }),
    } as unknown as WikiApiClient;

    const result = await downloadAttachment(client, { attachmentId });

    expect(Buffer.from(result.bytesBase64, 'base64').equals(Buffer.from(original))).toBe(true);
  });
});
