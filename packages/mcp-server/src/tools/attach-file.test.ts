import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WikiApiClient } from '../api-client';
import { attachFile } from './attach-file';

describe('attach_file', () => {
  const pageId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  let tmpDir: string;
  let originalCwd: string;
  // Snapshot + restore env vars touched by readFromPath.
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-attach-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockClient() {
    const attachFileMock = vi.fn().mockResolvedValue({
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      pageId,
      fileName: 'file',
      contentType: 'application/octet-stream',
      sizeBytes: 0,
      url: '/api/v1/attachments/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/content',
    });
    return {
      client: { attachFile: attachFileMock } as unknown as WikiApiClient,
      attachFileMock,
    };
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

    const [, file] = attachFileMock.mock.calls[0] as [unknown, File];
    expect(file.type).toBe(expectedType);
  });

  it('falls back to application/octet-stream for an unrecognized extension', async () => {
    const { client, attachFileMock } = mockClient();

    await attachFile(client, { pageId, fileBase64: Buffer.from('hello').toString('base64'), fileName: 'archive.zip' });

    const [, file] = attachFileMock.mock.calls[0] as [unknown, File];
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

    const [, file] = attachFileMock.mock.calls[0] as [unknown, File];
    expect(file.type).toBe('application/pdf');
  });

  it('decodes base64 bytes without corruption, including binary content', async () => {
    const { client, attachFileMock } = mockClient();
    const original = Buffer.from([0, 1, 2, 253, 254, 255, 0x50, 0x4b, 0x03, 0x04]);

    await attachFile(client, { pageId, fileBase64: original.toString('base64'), fileName: 'blob.bin' });

    const [, file] = attachFileMock.mock.calls[0] as [unknown, File];
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

    const [, file] = attachFileMock.mock.calls[0] as [unknown, File];
    const roundTripped = Buffer.from(await file.arrayBuffer());
    expect(roundTripped.equals(original)).toBe(true);
  });

  describe('filePath input', () => {
    it('reads a file from cwd and passes its bytes with the right mime', async () => {
      const { client, attachFileMock } = mockClient();
      const fileBytes = Buffer.from('%PDF-1.4\nfake pdf body\n');
      await fs.writeFile(path.join(tmpDir, 'report.pdf'), fileBytes);

      await attachFile(client, {
        pageId,
        filePath: 'report.pdf',
        fileName: 'report.pdf',
      });

      const [calledPageId, file] = attachFileMock.mock.calls[0] as [
        string,
        File,
      ];
      expect(calledPageId).toBe(pageId);
      expect(file.name).toBe('report.pdf');
      expect(file.type).toBe('application/pdf');
      const roundTripped = Buffer.from(await file.arrayBuffer());
      expect(roundTripped.equals(fileBytes)).toBe(true);
    });

    it('rejects path traversal (../)', async () => {
      const { client } = mockClient();
      await expect(
        attachFile(client, {
          pageId,
          filePath: '../../../etc/passwd',
          fileName: 'passwd.txt',
        }),
      ).rejects.toThrow(/outside allowed directories/i);
    });

    it('rejects non-existent file', async () => {
      const { client } = mockClient();
      await expect(
        attachFile(client, {
          pageId,
          filePath: 'nope.pdf',
          fileName: 'nope.pdf',
        }),
      ).rejects.toThrow(/does not exist|cannot be resolved/i);
    });
  });

  describe('exactly-one-of validation', () => {
    it('rejects when both fileBase64 and filePath are provided', async () => {
      const { client } = mockClient();
      await expect(
        attachFile(client, {
          pageId,
          fileBase64: Buffer.from('x').toString('base64'),
          filePath: 'report.pdf',
          fileName: 'report.pdf',
        }),
      ).rejects.toThrow(/exactly one/i);
    });

    it('rejects when neither fileBase64 nor filePath is provided', async () => {
      const { client } = mockClient();
      await expect(
        attachFile(client, {
          pageId,
          fileName: 'report.pdf',
        }),
      ).rejects.toThrow(/exactly one/i);
    });
  });
});