import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { transferArtifactStore } from '@/server/transfers/artifact-store';
import * as artifacts from '@/server/services/transfer-artifacts';

function parseRange(value: string | null, size: number) {
  const match = value ? /^bytes=(\d+)-(\d*)$/.exec(value) : null;
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

type ArtifactContext = Parameters<typeof artifacts.getRow>[0];

async function getReadyArtifact(ctx: ArtifactContext, id: string) {
  const row = await artifacts.getRow(ctx, id);
  if (row.status !== 'ready') {
    throw new DomainError('ARTIFACT_NOT_UPLOADABLE', 'Artifact is not ready');
  }
  try {
    await transferArtifactStore.size(row.storageKey);
  } catch (error) {
    if (isMissingFile(error)) {
      await artifacts.markMissing(ctx, id);
      throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer artifact content not found');
    }
    throw error;
  }
  return row;
}

function downloadHeaders(row: Awaited<ReturnType<typeof artifacts.getRow>>, contentLength: number) {
  return new Headers({
    'Content-Type': row.contentType,
    'Content-Disposition': `attachment; filename="${row.originalFilename ?? row.storageKey}"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Length': String(contentLength),
  });
}

async function handleHEAD(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    const row = await getReadyArtifact(await createApiContext(), id);
    return new NextResponse(null, { status: 200, headers: downloadHeaders(row, row.sizeBytes) });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    const row = await getReadyArtifact(await createApiContext(), id);
    const range = parseRange(request.headers.get('range'), row.sizeBytes);
    const stream = transferArtifactStore.read(row.storageKey, range ?? undefined);
    const headers = downloadHeaders(row, range ? range.end - range.start + 1 : row.sizeBytes);
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${row.sizeBytes}`);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  if (!request.body) return apiError('BAD_REQUEST', 'Request body is required', 400);
  try {
    return NextResponse.json(
      await artifacts.upload(
        await createApiContext(),
        id,
        request.body,
        request.headers.get('content-type'),
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Download a ready transfer artifact
 * @tag Transfers
 * @auth bearer
 * @response 200
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Probe a ready transfer artifact before downloading
 * @tag Transfers
 * @auth bearer
 * @response 200
 */
export const HEAD = withApiAudit(handleHEAD as unknown as RouteHandler);
/**
 * @openapi
 * @summary Upload raw ZIP bytes to a reserved artifact
 * @tag Transfers
 * @auth bearer
 * @response TransferArtifactView
 */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
