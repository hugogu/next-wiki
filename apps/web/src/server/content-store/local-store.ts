import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  access,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { getStoredContentType } from './asset-content-type';
import {
  ASSETS_PREFIX,
  BackendUnavailableError,
  ContentNotFoundError,
  MARKDOWN_PREFIX,
  assertSafeId,
  type ContentStore,
  type StorageBackendType,
} from './types';

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Filesystem-backed content store. Markdown lives at
 * `{basePath}/markdown/{revisionId}.md`; image bytes at
 * `{basePath}/assets/{assetId}`. All operations are confined to the configured
 * base directory and use write-to-temp-then-rename for atomic visibility.
 */
export class LocalStore implements ContentStore {
  readonly type: StorageBackendType = 'local';

  constructor(private readonly basePath: string) {
    if (!basePath) throw new Error('LocalStore requires a basePath');
  }

  private markdownPath(revisionId: string): string {
    assertSafeId(revisionId);
    return path.join(this.basePath, MARKDOWN_PREFIX, `${revisionId}.md`);
  }

  private imagePath(assetId: string): string {
    assertSafeId(assetId);
    return path.join(this.basePath, ASSETS_PREFIX, assetId);
  }

  private async atomicWrite(target: string, data: Buffer | string): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw new BackendUnavailableError(this.type, `write failed: ${target}`, error);
    }
  }

  async putMarkdown(revisionId: string, source: string): Promise<void> {
    await this.atomicWrite(this.markdownPath(revisionId), source);
  }

  async getMarkdown(revisionId: string): Promise<string> {
    const file = this.markdownPath(revisionId);
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        throw new ContentNotFoundError(this.type, `markdown/${revisionId}`);
      }
      throw new BackendUnavailableError(this.type, `read failed: markdown/${revisionId}`, error);
    }
  }

  // contentType is part of the interface but unused: the Local backend stores
  // only raw bytes; the mime type lives in `content_assets` (read on getImage).
  async putImage(assetId: string, bytes: Buffer, _contentType?: string): Promise<void> {
    await this.atomicWrite(this.imagePath(assetId), bytes);
  }

  async getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const file = this.imagePath(assetId);
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        throw new ContentNotFoundError(this.type, `assets/${assetId}`);
      }
      throw new BackendUnavailableError(this.type, `read failed: assets/${assetId}`, error);
    }
    const contentType = (await getStoredContentType(assetId)) ?? 'application/octet-stream';
    return { bytes, contentType };
  }

  async deleteImage(assetId: string): Promise<void> {
    await rm(this.imagePath(assetId), { force: true });
  }

  async *listMarkdownKeys(): AsyncIterable<string> {
    yield* this.listDir(MARKDOWN_PREFIX, (name) =>
      name.endsWith('.md') ? name.slice(0, -3) : null,
    );
  }

  async *listImageKeys(): AsyncIterable<string> {
    yield* this.listDir(ASSETS_PREFIX, (name) => name);
  }

  private async *listDir(
    sub: string,
    mapName: (name: string) => string | null,
  ): AsyncIterable<string> {
    let entries: string[];
    try {
      entries = await readdir(path.join(this.basePath, sub));
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return;
      throw new BackendUnavailableError(this.type, `list failed: ${sub}`, error);
    }
    for (const name of entries) {
      const key = mapName(name);
      if (key) yield key;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await mkdir(this.basePath, { recursive: true });
      await access(this.basePath, fsConstants.W_OK);
      const probe = path.join(this.basePath, `.healthcheck-${randomUUID()}`);
      await writeFile(probe, 'ok');
      await rm(probe, { force: true });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, detail: `base directory not writable: ${message}` };
    }
  }
}
