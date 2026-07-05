import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
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

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    const row = await artifacts.getRow(await createApiContext(), id);
    if (row.status !== 'ready') {
      throw new DomainError('ARTIFACT_NOT_UPLOADABLE', 'Artifact is not ready');
    }
    const range = parseRange(request.headers.get('range'), row.sizeBytes);
    const stream = transferArtifactStore.read(row.storageKey, range ?? undefined);
    const headers = new Headers({
      'Content-Type': row.contentType,
      'Content-Disposition': `attachment; filename="${row.originalFilename ?? row.storageKey}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(range ? range.end - range.start + 1 : row.sizeBytes),
    });
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${row.sizeBytes}`);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
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
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Download a ready transfer artifact @tag Transfers @auth bearer */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/** @openapi @summary Upload raw ZIP bytes to a reserved artifact @tag Transfers @auth bearer */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
