import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { env } from '@/server/config';

const STORAGE_KEY = /^[0-9a-f-]{36}\.(zip|json)$/;

function safeKey(storageKey: string): string {
  if (!STORAGE_KEY.test(storageKey)) throw new Error('Invalid transfer artifact storage key');
  return storageKey;
}

export type StoredArtifact = {
  storageKey: string;
  sizeBytes: number;
  contentHash: string;
};

export class TransferArtifactStore {
  constructor(
    readonly basePath: string = env.TRANSFER_ARTIFACT_BASE_PATH,
    readonly maxBytes: number = env.TRANSFER_MAX_COMPRESSED_BYTES,
  ) {}

  storageKey(id: string, contentType: string): string {
    return `${id}.${contentType === 'application/json' ? 'json' : 'zip'}`;
  }

  private resolved(storageKey: string): string {
    return path.join(this.basePath, safeKey(storageKey));
  }

  pathFor(storageKey: string): string {
    return this.resolved(storageKey);
  }

  private partial(storageKey: string): string {
    return `${this.resolved(storageKey)}.partial`;
  }

  async write(
    storageKey: string,
    source: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    maxBytes = this.maxBytes,
  ): Promise<StoredArtifact> {
    await mkdir(this.basePath, { recursive: true });
    const finalPath = this.resolved(storageKey);
    const partialPath = this.partial(storageKey);
    await rm(partialPath, { force: true });

    let sizeBytes = 0;
    const hash = createHash('sha256');
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        if (sizeBytes > maxBytes) {
          callback(Object.assign(new Error('Transfer artifact exceeds configured limit'), {
            code: 'ARCHIVE_TOO_LARGE',
          }));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const input =
      source instanceof ReadableStream
        ? Readable.from(source as unknown as AsyncIterable<Uint8Array>)
        : (source as NodeJS.ReadableStream);
    const output = createWriteStream(partialPath, { flags: 'w', mode: 0o600 });
    try {
      await pipeline(input, counter, output);
      const handle = await open(partialPath, 'r');
      await handle.sync();
      await handle.close();
      await rename(partialPath, finalPath);
      return { storageKey, sizeBytes, contentHash: hash.digest('hex') };
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async writeBuffer(storageKey: string, bytes: Buffer, maxBytes = this.maxBytes) {
    return this.write(storageKey, Readable.from(bytes), maxBytes);
  }

  async createWriteStream(storageKey: string): Promise<{
    stream: NodeJS.WritableStream;
    complete: () => Promise<StoredArtifact>;
    abort: () => Promise<void>;
  }> {
    await mkdir(this.basePath, { recursive: true });
    const finalPath = this.resolved(storageKey);
    const partialPath = this.partial(storageKey);
    const hash = createHash('sha256');
    let sizeBytes = 0;
    const output = createWriteStream(partialPath, { flags: 'w', mode: 0o600 });
    const counter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > this.maxBytes) {
          callback(new Error('Transfer artifact exceeds configured limit'));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    counter.pipe(output);
    return {
      stream: counter,
      complete: async () => {
        await finished(output);
        await rename(partialPath, finalPath);
        return { storageKey, sizeBytes, contentHash: hash.digest('hex') };
      },
      abort: () => rm(partialPath, { force: true }),
    };
  }

  async size(storageKey: string): Promise<number> {
    return (await stat(this.resolved(storageKey))).size;
  }

  read(storageKey: string, range?: { start: number; end: number }) {
    return createReadStream(this.resolved(storageKey), range);
  }

  async delete(storageKey: string): Promise<void> {
    await Promise.all([
      rm(this.resolved(storageKey), { force: true }),
      rm(this.partial(storageKey), { force: true }),
    ]);
  }
}

export const transferArtifactStore = new TransferArtifactStore();
