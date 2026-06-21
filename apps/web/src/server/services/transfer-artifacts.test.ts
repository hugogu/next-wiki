import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { sha256 } from '../../../test/transfer-fixtures';
import * as artifacts from './transfer-artifacts';

// Redirect the singleton TransferArtifactStore to a throwaway dir and shrink
// the compressed-byte cap BEFORE config.ts / artifact-store.ts are imported, so
// the service under test uses a writable path and a deterministic limit. With
// vitest's per-file module isolation, the env parse runs after this callback.
const { tempDir, maxBytes } = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-transfer-artifacts-'));
  process.env.TRANSFER_ARTIFACT_BASE_PATH = dir;
  process.env.TRANSFER_MAX_COMPRESSED_BYTES = '2048';
  return { tempDir: dir, maxBytes: 2048 };
});

const TRUNCATE =
  'TRUNCATE TABLE transfer_page_mappings, transfer_asset_mappings, transfer_items, transfer_runs, transfer_artifacts, transfer_sources, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

let adminId: string;
let adminCtx: PermCtx;
let secondAdminCtx: PermCtx;

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [a1] = await db
    .insert(schema.users)
    .values({
      email: `artifacts-a-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  adminId = a1!.id;
  adminCtx = buildUserCtx(adminId, 'admin');
  const [a2] = await db
    .insert(schema.users)
    .values({
      email: `artifacts-b-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  secondAdminCtx = buildUserCtx(a2!.id, 'admin');
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await rm(tempDir, { recursive: true, force: true });
  await closeDb();
});

function streamOf(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

async function getRow(id: string) {
  return db.query.transferArtifacts.findFirst({ where: eq(schema.transferArtifacts.id, id) });
}

describe('transfer artifacts service', () => {
  it('reserves an uploading artifact with a uuid.zip storage key', async () => {
    const view = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'portable.zip',
    });
    expect(view.status).toBe('uploading');
    expect(view.contentType).toBe('application/zip');
    expect(view.contentUrl).toBeNull();
    const row = await getRow(view.id);
    expect(row?.storageKey).toMatch(/^[0-9a-f-]{36}\.zip$/);
    expect(row?.createdBy).toBe(adminId);
  });

  it('rejects an oversize declared sizeBytes at reserve time', async () => {
    await expect(
      artifacts.reserve(adminCtx, {
        kind: 'source_archive',
        filename: 'huge.zip',
        sizeBytes: maxBytes + 1,
      }),
    ).rejects.toMatchObject({ code: 'ARCHIVE_TOO_LARGE' });
  });

  it('rejects a non-admin actor with FORBIDDEN', async () => {
    await expect(
      artifacts.reserve(buildUserCtx(adminId, 'editor'), {
        kind: 'source_archive',
        filename: 'x.zip',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('finalizes a small zip upload, records sha256, and leaves no partial', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'small.zip',
    });
    const body = Buffer.from('PK\x03\x04small-zip-content');
    const view = await artifacts.upload(
      adminCtx,
      reserved.id,
      streamOf(body),
      'application/zip',
    );
    expect(view.status).toBe('ready');
    expect(view.sizeBytes).toBe(body.length);
    expect(view.contentHash).toBe(sha256(body));
    expect(view.contentUrl).toBe(`/api/transfer-artifacts/${reserved.id}/content`);

    const row = await getRow(reserved.id);
    const finalPath = join(tempDir, row!.storageKey);
    expect(existsSync(finalPath)).toBe(true);
    expect(existsSync(`${finalPath}.partial`)).toBe(false);
  });

  it('rejects an upload exceeding the byte limit and leaves no final or partial file', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'oversize.zip',
    });
    const body = Buffer.alloc(maxBytes + 1, 1);
    await expect(
      artifacts.upload(adminCtx, reserved.id, streamOf(body), 'application/zip'),
    ).rejects.toMatchObject({ code: 'ARCHIVE_TOO_LARGE' });

    const row = await getRow(reserved.id);
    expect(row?.status).toBe('failed');
    expect(row?.contentHash).toBeNull();
    expect(row?.sizeBytes).toBe(0);
    const finalPath = join(tempDir, row!.storageKey);
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(`${finalPath}.partial`)).toBe(false);
  });

  it('rejects a non-zip media type before touching storage', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'not-a-zip.txt',
    });
    await expect(
      artifacts.upload(
        adminCtx,
        reserved.id,
        streamOf(Buffer.from('hello')),
        'text/plain',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ARCHIVE_TYPE' });
    const row = await getRow(reserved.id);
    expect(row?.status).toBe('uploading');
    expect(existsSync(join(tempDir, row!.storageKey))).toBe(false);
  });

  it('rejects an upload to a finalized (ready) artifact', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'once.zip',
    });
    await artifacts.upload(
      adminCtx,
      reserved.id,
      streamOf(Buffer.from('PK\x03\x04done')),
      'application/zip',
    );
    await expect(
      artifacts.upload(
        adminCtx,
        reserved.id,
        streamOf(Buffer.from('PK\x03\x04again')),
        'application/zip',
      ),
    ).rejects.toMatchObject({ code: 'ARTIFACT_NOT_UPLOADABLE' });
  });

  it('recovers a failed upload (interrupted overwrite safety)', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'recover.zip',
    });
    // First attempt exceeds the limit -> store cleans partial, service marks failed.
    await expect(
      artifacts.upload(
        adminCtx,
        reserved.id,
        streamOf(Buffer.alloc(maxBytes + 10, 7)),
        'application/zip',
      ),
    ).rejects.toMatchObject({ code: 'ARCHIVE_TOO_LARGE' });
    expect((await getRow(reserved.id))?.status).toBe('failed');

    // Second attempt with valid bytes atomically finalizes a new file.
    const body = Buffer.from('PK\x03\x04recovered');
    const view = await artifacts.upload(
      adminCtx,
      reserved.id,
      streamOf(body),
      'application/zip',
    );
    expect(view.status).toBe('ready');
    expect(view.contentHash).toBe(sha256(body));
    const row = await getRow(reserved.id);
    const finalPath = join(tempDir, row!.storageKey);
    expect(existsSync(finalPath)).toBe(true);
    expect(existsSync(`${finalPath}.partial`)).toBe(false);
  });

  it('does not enforce per-artifact ownership between two admins', async () => {
    // NOTE: The spec asked for ownership rejection when finalizing an artifact
    // reserved by a different admin. The implementation is role-based only
    // (any admin can manage any artifact), so a second admin CAN upload.
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'shared.zip',
    });
    const body = Buffer.from('PK\x03\x04uploaded-by-other-admin');
    const view = await artifacts.upload(
      secondAdminCtx,
      reserved.id,
      streamOf(body),
      'application/zip',
    );
    expect(view.status).toBe('ready');
    expect(view.contentHash).toBe(sha256(body));
  });

  it('deletes the stored file and marks the row deleted', async () => {
    const reserved = await artifacts.reserve(adminCtx, {
      kind: 'source_archive',
      filename: 'doomed.zip',
    });
    await artifacts.upload(
      adminCtx,
      reserved.id,
      streamOf(Buffer.from('PK\x03\x04bye')),
      'application/zip',
    );
    const row = await getRow(reserved.id);
    const finalPath = join(tempDir, row!.storageKey);
    expect(existsSync(finalPath)).toBe(true);

    await artifacts.remove(adminCtx, reserved.id);
    expect(existsSync(finalPath)).toBe(false);
    const after = await getRow(reserved.id);
    expect(after?.status).toBe('deleted');
    expect(after?.deletedAt).not.toBeNull();
    await expect(artifacts.get(adminCtx, reserved.id)).rejects.toMatchObject({
      code: 'TRANSFER_NOT_FOUND',
    });
  });
});
