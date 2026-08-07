import { describe, expect, it, vi } from 'vitest';
import type { WikiApiClient } from '../api-client';
import { attachFile } from './attach-file';

describe('attach_file', () => {
  const pageId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  function mockClient() {
    const attachFileMock = vi.fn().mockResolvedValue({
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      pageId,
      fileName: 'file',
      contentType: 'application/octet-stream',
      sizeBytes: 0,
      url: '/api/v1/attachments/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/content',
    });
    return { client: { attachFile: attachFileMock } as unknown as WikiApiClient, attachFileMock };
  }

  it.each([
    ['notes.txt', 'text/plain'],
    ['readme.md', 'text/markdown'],
    ['data.csv', 'text/csv'],
    ['photo.png', 'image/png'],
    ['clip.mp4', 'video/mp4'],
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('infers %s as %s when mimeType is omitted', async (fileName, expectedType) => {
    const { client, attachFileMock } = mockClient();

    await attachFile(client, { pageId, fileBase64: Buffer.from('hello').toString('base64'), fileName });

    const file = attachFileMock.mock.calls[0][1] as File;
    expect(file.type).toBe(expectedType);
  });

  it('falls back to application/octet-stream for an unrecognized extension', async () => {
    const { client, attachFileMock } = mockClient();

    await attachFile(client, { pageId, fileBase64: Buffer.from('hello').toString('base64'), fileName: 'archive.zip' });

    const file = attachFileMock.mock.calls[0][1] as File;
    expect(file.type).toBe('application/octet-stream');
  });

  it('respects an explicit mimeType over inference', async () => {
    const { client, attachFileMock } = mockClient();

    await attachFile(client, {
      pageId,
      fileBase64: Buffer.from('hello').toString('base64'),
      fileName: 'notes.txt',
      mimeType: 'application/pdf',
    });

    const file = attachFileMock.mock.calls[0][1] as File;
    expect(file.type).toBe('application/pdf');
  });

  it('decodes base64 bytes without corruption, including binary content', async () => {
    const { client, attachFileMock } = mockClient();
    const original = Buffer.from([0, 1, 2, 253, 254, 255, 0x50, 0x4b, 0x03, 0x04]);

    await attachFile(client, { pageId, fileBase64: original.toString('base64'), fileName: 'blob.bin' });

    const file = attachFileMock.mock.calls[0][1] as File;
    const roundTripped = Buffer.from(await file.arrayBuffer());
    expect(roundTripped.equals(original)).toBe(true);
  });

  it('strips a data: URL prefix before decoding', async () => {
    const { client, attachFileMock } = mockClient();
    const original = Buffer.from('hello world');

    await attachFile(client, {
      pageId,
      fileBase64: `data:text/plain;base64,${original.toString('base64')}`,
      fileName: 'notes.txt',
    });

    const file = attachFileMock.mock.calls[0][1] as File;
    const roundTripped = Buffer.from(await file.arrayBuffer());
    expect(roundTripped.equals(original)).toBe(true);
  });
});
