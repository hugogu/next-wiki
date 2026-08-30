import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WikiApiClient } from '../api-client';
import { uploadImage } from './upload-image';

describe('upload_image', () => {
  let tmpDir: string;
  let originalCwd: string;
  // Snapshot + restore env vars touched by readFromPath.
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-upload-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockClient() {
    const uploadImageMock = vi.fn().mockResolvedValue({
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      url: '/api/v1/assets/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/content',
      markdown:
        '![image](/api/v1/assets/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/content)',
      contentType: 'image/jpeg',
      sizeBytes: 100,
    });
    return {
      client: { uploadImage: uploadImageMock } as unknown as WikiApiClient,
      uploadImageMock,
    };
  };

  describe('imageBase64 input (existing path, regression)', () => {
    it('decodes base64 bytes correctly and passes them as a File', async () => {
      const { client, uploadImageMock } = mockClient();
      const original = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG header

      await uploadImage(client, {
        imageBase64: original.toString('base64'),
        filename: 'photo.jpg',
      });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      expect(file.name).toBe('photo.jpg');
      expect(file.type).toBe('image/jpeg');
      const roundTripped = Buffer.from(await file.arrayBuffer());
      expect(roundTripped.equals(original)).toBe(true);
    });

    it('strips a data:image/...;base64, prefix before decoding', async () => {
      const { client, uploadImageMock } = mockClient();
      const original = Buffer.from('hello world');

      await uploadImage(client, {
        imageBase64: `data:image/png;base64,${original.toString('base64')}`,
        filename: 'hi.png',
      });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      const roundTripped = Buffer.from(await file.arrayBuffer());
      expect(roundTripped.equals(original)).toBe(true);
    });

    it('infers mime type from filename', async () => {
      const { client, uploadImageMock } = mockClient();

      await uploadImage(client, {
        imageBase64: Buffer.from('x').toString('base64'),
        filename: 'logo.webp',
      });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      expect(file.type).toBe('image/webp');
    });

    it('respects an explicit mimeType over inference', async () => {
      const { client, uploadImageMock } = mockClient();

      await uploadImage(client, {
        imageBase64: Buffer.from('x').toString('base64'),
        filename: 'photo.jpg',
        mimeType: 'image/png',
      });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      expect(file.type).toBe('image/png');
    });
  });

  describe('filePath input (new)', () => {
    it('reads a file from cwd and passes its bytes', async () => {
      const { client, uploadImageMock } = mockClient();
      const fileBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      await fs.writeFile(path.join(tmpDir, 'photo.jpg'), fileBytes);

      await uploadImage(client, { filePath: 'photo.jpg', filename: 'photo.jpg' });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      expect(file.name).toBe('photo.jpg');
      expect(file.type).toBe('image/jpeg');
      const roundTripped = Buffer.from(await file.arrayBuffer());
      expect(roundTripped.equals(fileBytes)).toBe(true);
    });

    it('reads an absolute path inside an allowlisted dir', async () => {
      // Allow /tmp explicitly (otherwise the default cwd scope would reject it).
      process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = tmpDir;
      const { client, uploadImageMock } = mockClient();
      const fileBytes = Buffer.from('absolute-path-content');
      const absPath = path.join(tmpDir, 'absolute.jpg');
      await fs.writeFile(absPath, fileBytes);

      await uploadImage(client, { filePath: absPath, filename: 'absolute.jpg' });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      const roundTripped = Buffer.from(await file.arrayBuffer());
      expect(roundTripped.equals(fileBytes)).toBe(true);
    });

    it('infers mime type from filename when reading from disk', async () => {
      const { client, uploadImageMock } = mockClient();
      await fs.writeFile(path.join(tmpDir, 'logo.webp'), Buffer.from('x'));

      await uploadImage(client, {
        filePath: 'logo.webp',
        filename: 'logo.webp',
      });

      const [file] = uploadImageMock.mock.calls[0] as [File];
      expect(file.type).toBe('image/webp');
    });

    it('rejects path traversal (../)', async () => {
      const { client } = mockClient();
      await expect(
        uploadImage(client, { filePath: '../../../etc/passwd' }),
      ).rejects.toThrow(/outside allowed directories/i);
    });

    it('rejects absolute path outside the default cwd scope', async () => {
      const { client } = mockClient();
      // Don't allow /tmp here — should be rejected by cwd scope.
      await expect(
        uploadImage(client, { filePath: '/etc/hostname' }),
      ).rejects.toThrow(/outside allowed directories/i);
    });

    it('allows an absolute path when the parent dir is in NEXT_WIKI_MCP_FILE_ALLOW_DIRS', async () => {
      process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = `/nonexistent:${tmpDir}`;
      const { client, uploadImageMock } = mockClient();
      await fs.writeFile(path.join(tmpDir, 'a.jpg'), Buffer.from('allowed'));

      await uploadImage(client, { filePath: path.join(tmpDir, 'a.jpg'), filename: 'a.jpg' });

      expect(uploadImageMock).toHaveBeenCalledOnce();
    });

    it('rejects symlink that escapes the allowed dir', async () => {
      const { client } = mockClient();
      const linkPath = path.join(tmpDir, 'sneaky');
      try {
        await fs.symlink('/etc/hostname', linkPath);
      } catch {
        // Skip if symlink not supported (some sandboxes / Windows).
        return;
      }

      await expect(
        uploadImage(client, { filePath: 'sneaky' }),
      ).rejects.toThrow(/outside allowed directories/i);
    });

    it('accepts files when the allow-listed dir is reached via a symlink', async () => {
      // Reproduce the macOS /tmp -> /private/tmp case locally: create a
      // real subdir `real` inside tmpDir, symlink it as `link`, then
      // chdir to `link` and set the allow-list to the symlinked path.
      // The file lives at the realpath (`tmpDir/real/photo.jpg`); without
      // realpath-canonicalisation of the allow-list, the startsWith check
      // would fail.
      const { client, uploadImageMock } = mockClient();
      const realDir = path.join(tmpDir, 'real');
      const linkPath = path.join(tmpDir, 'link');
      await fs.mkdir(realDir);
      await fs.writeFile(path.join(realDir, 'photo.jpg'), Buffer.from('symlinked-allow'));
      try {
        await fs.symlink(realDir, linkPath);
      } catch {
        // Skip if symlink not supported (some sandboxes / Windows).
        return;
      }

      const startingCwd = process.cwd();
      try {
        process.chdir(linkPath);
        process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = linkPath;

        await uploadImage(client, { filePath: 'photo.jpg', filename: 'photo.jpg' });

        expect(uploadImageMock).toHaveBeenCalledOnce();
      } finally {
        process.chdir(startingCwd);
      }
    });

    it('rejects directory (not a regular file)', async () => {
      const { client } = mockClient();
      await fs.mkdir(path.join(tmpDir, 'subdir'));

      await expect(
        uploadImage(client, { filePath: 'subdir' }),
      ).rejects.toThrow(/not a regular file/i);
    });

    it('rejects non-existent file', async () => {
      const { client } = mockClient();

      await expect(
        uploadImage(client, { filePath: 'nope.jpg' }),
      ).rejects.toThrow(/does not exist|cannot be resolved/i);
    });

    it('rejects file exceeding the configured max bytes', async () => {
      process.env.NEXT_WIKI_MCP_UPLOAD_MAX_BYTES = '100'; // 100 bytes for the test
      const { client } = mockClient();
      // 1 KB file — exceeds the 100-byte cap set just above.
      await fs.writeFile(path.join(tmpDir, 'big.jpg'), Buffer.alloc(1024, 0));

      await expect(
        uploadImage(client, {
          filePath: 'big.jpg',
          filename: 'big.jpg',
        }),
      ).rejects.toThrow(/exceeds.*bytes/i);
    });

    it('honours a larger cap when NEXT_WIKI_MCP_UPLOAD_MAX_BYTES is raised', async () => {
      process.env.NEXT_WIKI_MCP_UPLOAD_MAX_BYTES = '2048'; // 2 KB
      const { client, uploadImageMock } = mockClient();
      await fs.writeFile(path.join(tmpDir, 'ok.jpg'), Buffer.alloc(1024, 0)); // 1 KB — under 2 KB cap

      await uploadImage(client, {
        filePath: 'ok.jpg',
        filename: 'ok.jpg',
      });

      expect(uploadImageMock).toHaveBeenCalledOnce();
    });
  });

  describe('exactly-one-of validation', () => {
    it('rejects when both imageBase64 and filePath are provided', async () => {
      const { client } = mockClient();
      await expect(
        uploadImage(client, {
          imageBase64: Buffer.from('x').toString('base64'),
          filePath: 'photo.jpg',
        }),
      ).rejects.toThrow(/exactly one/i);
    });

    it('rejects when neither imageBase64 nor filePath is provided', async () => {
      const { client } = mockClient();
      await expect(
        uploadImage(client, { filename: 'photo.jpg' }),
      ).rejects.toThrow(/exactly one/i);
    });
  });
});