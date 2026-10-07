import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MAX_TEXT_BYTES, readTextFromPath } from './_file-source';

describe('readTextFromPath', () => {
  let dir: string;
  let outside: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-text-allowed-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-text-outside-'));
    process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = dir;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  async function write(name: string, content: string | Buffer, where = dir) {
    const file = path.join(where, name);
    await fs.writeFile(file, content);
    return file;
  }

  it('reads UTF-8 text unchanged, including CJK and line endings', async () => {
    const text = '# 标题\n\n正文 — ✓ 😀\r\n- item\n';
    expect(await readTextFromPath(await write('note.md', text))).toBe(text);
  });

  it('strips a UTF-8 byte order mark', async () => {
    const file = await write('bom.md', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Hi')]));
    expect(await readTextFromPath(file)).toBe('# Hi');
  });

  it.each(['a.md', 'a.markdown', 'a.txt', 'A.MD'])('accepts %s', async (name) => {
    expect(await readTextFromPath(await write(name, 'body'))).toBe('body');
  });

  describe('path', () => {
    it.each(['notes.md', './notes.md', '../notes.md'])('rejects the relative path %s', async (relative) => {
      await expect(readTextFromPath(relative)).rejects.toThrow(/must be an absolute path/);
    });

    it('rejects ~ and says it is not expanded', async () => {
      await expect(readTextFromPath('~/.openclaw/workspace/paper.md')).rejects.toThrow(/absolute path.*"~"/);
    });

    it.each(['.env', 'data.json', 'script.sh', 'README'])('rejects the file name %s', async (name) => {
      await expect(readTextFromPath(path.join(dir, name))).rejects.toThrow(/Markdown or plain-text file/);
    });

    it('rejects a file that does not exist', async () => {
      await expect(readTextFromPath(path.join(dir, 'missing.md'))).rejects.toThrow(/does not exist/);
    });

    it('rejects a directory named like a Markdown file', async () => {
      await fs.mkdir(path.join(dir, 'folder.md'));
      await expect(readTextFromPath(path.join(dir, 'folder.md'))).rejects.toThrow(/not a regular file/);
    });
  });

  describe('allow-list', () => {
    it.each([undefined, '', '  '])('is off until NEXT_WIKI_MCP_FILE_ALLOW_DIRS is set (%j)', async (value) => {
      const file = await write('note.md', 'body');
      if (value === undefined) delete process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS;
      else process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = value;

      await expect(readTextFromPath(file)).rejects.toThrow(/off until NEXT_WIKI_MCP_FILE_ALLOW_DIRS/);
    });

    it('does not fall back to the working directory', async () => {
      const originalCwd = process.cwd();
      const file = await write('note.md', 'body');
      process.chdir(dir);
      try {
        delete process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS;
        await expect(readTextFromPath(file)).rejects.toThrow(/off until NEXT_WIKI_MCP_FILE_ALLOW_DIRS/);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('rejects a file outside the listed directories', async () => {
      const file = await write('note.md', 'body', outside);
      await expect(readTextFromPath(file)).rejects.toThrow(/outside allowed directories/);
    });

    it('rejects a traversal out of a listed directory', async () => {
      await write('note.md', 'body', outside);
      // Built by hand: path.join would normalise the ".." away.
      const traversal = `${dir}/../${path.basename(outside)}/note.md`;
      await expect(readTextFromPath(traversal)).rejects.toThrow(/outside allowed directories/);
    });

    it('rejects a symlink that leads outside the listed directories', async () => {
      const target = await write('secret.md', 'secret', outside);
      await fs.symlink(target, path.join(dir, 'link.md'));
      await expect(readTextFromPath(path.join(dir, 'link.md'))).rejects.toThrow(/outside allowed directories/);
    });
  });

  describe('content', () => {
    it('rejects an empty file', async () => {
      await expect(readTextFromPath(await write('empty.md', ''))).rejects.toThrow(/is empty/);
    });

    it('rejects a file over the page-body limit', async () => {
      const file = await write('big.md', Buffer.alloc(MAX_TEXT_BYTES + 1, 'a'));
      await expect(readTextFromPath(file)).rejects.toThrow(/limited to/);
    });

    it('accepts a file exactly at the limit', async () => {
      const file = await write('limit.md', Buffer.alloc(MAX_TEXT_BYTES, 'a'));
      expect((await readTextFromPath(file)).length).toBe(MAX_TEXT_BYTES);
    });

    it('rejects bytes that are not UTF-8', async () => {
      await expect(readTextFromPath(await write('latin1.md', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0xff])))).rejects.toThrow(
        /valid UTF-8/,
      );
    });

    it('rejects a binary file with a text name', async () => {
      await expect(readTextFromPath(await write('blob.txt', Buffer.from([0x41, 0x00, 0x42])))).rejects.toThrow(/binary/);
    });
  });
});
