import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const transfers = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
}));
const artifacts = vi.hoisted(() => ({
  get: vi.fn(),
  getRow: vi.fn(),
}));
const artifactStore = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock('@/server/api/session', () => ({
  // Admin actor by default; individual tests override via mockResolvedValueOnce.
  createApiContext: vi.fn(async () => ({
    actor: { kind: 'user', userId: 'admin', role: 'admin' },
  })),
}));
vi.mock('@/server/services/transfers', () => transfers);
vi.mock('@/server/services/transfer-artifacts', () => artifacts);
vi.mock('@/server/transfers/artifact-store', () => ({
  transferArtifactStore: artifactStore,
}));

import { createApiContext } from '@/server/api/session';
import * as listRoute from './route';
import * as detailRoute from './[id]/route';
import * as artifactMetaRoute from '../transfer-artifacts/[id]/route';
import * as artifactContentRoute from '../transfer-artifacts/[id]/content/route';

function jsonRequest(method: string, url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('transfer export REST routes', () => {
  it('admin POST /api/transfers creates a queued site_export run (202)', async () => {
    const runId = randomUUID();
    transfers.create.mockResolvedValue({ id: runId, status: 'queued' });

    const response = await listRoute.POST(
      jsonRequest('POST', 'http://localhost/api/transfers', { kind: 'site_export' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: runId, status: 'queued' });
    expect(transfers.create).toHaveBeenCalledWith(
      { actor: { kind: 'user', userId: 'admin', role: 'admin' } },
      { kind: 'site_export' },
    );
  });

  it('rejects a non-admin actor with 403', async () => {
    vi.mocked(createApiContext).mockResolvedValueOnce({
      actor: { kind: 'user', userId: 'editor', role: 'editor' },
    });
    // The real service's assertCanManageTransfers raises FORBIDDEN for editors.
    transfers.create.mockRejectedValue(
      new DomainError('FORBIDDEN', 'You do not have permission to manage transfers'),
    );

    const response = await listRoute.POST(
      jsonRequest('POST', 'http://localhost/api/transfers', { kind: 'site_export' }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  it('GET /api/transfers/[id] returns the sanitized run view', async () => {
    const runId = randomUUID();
    transfers.get.mockResolvedValue({
      id: runId,
      kind: 'site_export',
      status: 'completed',
      phase: 'completed',
      actorUserId: null,
      sourceId: null,
      sourceArtifactId: null,
      previewRunId: null,
      options: {},
      sourceFingerprint: null,
      totalItems: 2,
      processedItems: 2,
      createdItems: 2,
      replacedItems: 0,
      skippedItems: 0,
      convertedItems: 0,
      warningItems: 0,
      failedItems: 0,
      currentItem: null,
      cancelRequested: false,
      errorCode: null,
      errorMessage: null,
      errorDetail: null,
      reportArtifactId: null,
      queuedAt: '2026-06-21T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      expiresAt: '2026-06-24T00:00:00.000Z',
      canCancel: false,
      canRetry: false,
    });

    const response = await detailRoute.GET(
      new NextRequest(`http://localhost/api/transfers/${runId}`),
      { params: Promise.resolve({ id: runId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(runId);
    // Computed view flags are surfaced...
    expect(body.canCancel).toBe(false);
    expect(body.canRetry).toBe(false);
    // ...while internal DB-only columns (e.g. the mutation lock) are not leaked.
    expect(body).not.toHaveProperty('activeMutationSlot');
  });

  it('GET /api/transfer-artifacts/[id] returns artifact metadata without secrets', async () => {
    const id = randomUUID();
    artifacts.get.mockResolvedValue({
      id,
      kind: 'export_archive',
      status: 'ready',
      runId: null,
      originalFilename: 'next-wiki-export.zip',
      contentType: 'application/zip',
      sizeBytes: 1024,
      contentHash: 'a'.repeat(64),
      contentUrl: `/api/transfer-artifacts/${id}/content`,
      expiresAt: '2026-06-24T00:00:00.000Z',
      createdAt: '2026-06-21T00:00:00.000Z',
      readyAt: '2026-06-21T00:05:00.000Z',
      deletedAt: null,
    });

    const response = await artifactMetaRoute.GET(
      new NextRequest(`http://localhost/api/transfer-artifacts/${id}`),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.contentUrl).toBe(`/api/transfer-artifacts/${id}/content`);
    // The artifact view never carries credentials.
    expect(JSON.stringify(body)).not.toMatch(/credential|secret|token|password/i);
  });

  it('GET /api/transfer-artifacts/[id]/content streams bytes and leaks no internals', async () => {
    const id = randomUUID();
    const PAYLOAD = 'portable-archive-bytes';
    artifacts.getRow.mockResolvedValue({
      id,
      status: 'ready',
      storageKey: 'mock.zip',
      contentType: 'application/zip',
      sizeBytes: Buffer.byteLength(PAYLOAD),
      originalFilename: 'next-wiki-export.zip',
      // An internal field the route must never forward to the client.
      _internalNote: 'DO-NOT-LEAK-9',
    });
    artifactStore.read.mockReturnValue(Readable.from([Buffer.from(PAYLOAD)]));

    const response = await artifactContentRoute.GET(
      new NextRequest(`http://localhost/api/transfer-artifacts/${id}/content`),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('next-wiki-export.zip');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toBe('private, no-store');

    const text = await response.text();
    expect(text).toBe(PAYLOAD);
    // Neither the body nor the headers expose the internal row field.
    expect(text).not.toContain('DO-NOT-LEAK-9');
    expect(
      JSON.stringify(Object.fromEntries(response.headers.entries())),
    ).not.toContain('DO-NOT-LEAK-9');
  });
});
