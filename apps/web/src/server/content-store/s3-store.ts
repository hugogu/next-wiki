import { Buffer } from 'node:buffer';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

export type S3StoreConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

function describeS3Error(error: unknown): string {
  const value = error as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number; requestId?: string };
  };
  const parts = [
    value.$metadata?.httpStatusCode ? `HTTP ${value.$metadata.httpStatusCode}` : undefined,
    value.Code ?? (value.name && value.name !== 'UnknownError' ? value.name : undefined),
    value.message && value.message !== 'UnknownError' ? value.message : undefined,
    value.$metadata?.requestId ? `request ${value.$metadata.requestId}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ') || 'S3 returned an unknown error';
}

/**
 * S3-compatible object store (works with AWS S3 and MinIO via an endpoint
 * override). Markdown at `{prefix}/markdown/{revisionId}.md`; image bytes at
 * `{prefix}/assets/{assetId}`. All keys are confined to the configured prefix.
 */
export class S3Store implements ContentStore {
  readonly type: StorageBackendType = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3StoreConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix?.replace(/^\/+|\/+$/g, '') ?? '';
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // Path-style addressing is required by MinIO and custom endpoints.
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private key(sub: string, id: string, suffix = ''): string {
    assertSafeId(id);
    const parts = [this.prefix, sub, `${id}${suffix}`].filter(Boolean);
    return parts.join('/');
  }

  private markdownKey(revisionId: string): string {
    return this.key(MARKDOWN_PREFIX, revisionId, '.md');
  }

  private imageKey(assetId: string): string {
    return this.key(ASSETS_PREFIX, assetId);
  }

  async presignImage(assetId: string, expiresIn = 60): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: this.imageKey(assetId) }),
      { expiresIn },
    );
  }

  async putMarkdown(revisionId: string, source: string): Promise<void> {
    await this.put(this.markdownKey(revisionId), Buffer.from(source, 'utf8'), 'text/markdown');
  }

  async getMarkdown(revisionId: string): Promise<string> {
    const bytes = await this.get(this.markdownKey(revisionId), `markdown/${revisionId}`);
    return bytes.toString('utf8');
  }

  async putImage(assetId: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.put(this.imageKey(assetId), bytes, contentType);
  }

  async getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const key = this.imageKey(assetId);
    let response;
    try {
      response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (isNotFound(error)) throw new ContentNotFoundError(this.type, `assets/${assetId}`);
      throw new BackendUnavailableError(this.type, `read failed: assets/${assetId}`, error);
    }
    const bytes = Buffer.from(await response.Body!.transformToByteArray());
    const contentType =
      response.ContentType ?? (await getStoredContentType(assetId)) ?? 'application/octet-stream';
    return { bytes, contentType };
  }

  async deleteMarkdown(revisionId: string): Promise<void> {
    await this.deleteKey(this.markdownKey(revisionId), `markdown/${revisionId}`);
  }

  async deleteImage(assetId: string): Promise<void> {
    await this.deleteKey(this.imageKey(assetId), `assets/${assetId}`);
  }

  private async deleteKey(key: string, label: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return;
      throw new BackendUnavailableError(this.type, `delete failed: ${label}`, error);
    }
  }

  async *listMarkdownKeys(): AsyncIterable<string> {
    const prefix = [this.prefix, MARKDOWN_PREFIX].filter(Boolean).join('/') + '/';
    for await (const key of this.list(prefix)) {
      if (key.endsWith('.md')) yield key.slice(prefix.length, -3);
    }
  }

  async *listImageKeys(): AsyncIterable<string> {
    const prefix = [this.prefix, ASSETS_PREFIX].filter(Boolean).join('/') + '/';
    for await (const key of this.list(prefix)) {
      yield key.slice(prefix.length);
    }
  }

  private async *list(prefix: string): AsyncIterable<string> {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) yield obj.Key;
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  private async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    } catch (error) {
      throw new BackendUnavailableError(this.type, `write failed: ${key}`, error);
    }
  }

  private async get(key: string, label: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (error) {
      if (isNotFound(error)) throw new ContentNotFoundError(this.type, label);
      throw new BackendUnavailableError(this.type, `read failed: ${label}`, error);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (error) {
      const detail = describeS3Error(error);
      return {
        ok: false,
        detail: `bucket not reachable: ${detail}. Check endpoint, region, bucket, access key, secret, and bucket permissions.`,
      };
    }
  }
}
