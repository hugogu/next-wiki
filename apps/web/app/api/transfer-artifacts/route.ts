import { NextResponse, type NextRequest } from 'next/server';
import { transferArtifactReserveSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { formatZodError } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as artifacts from '@/server/services/transfer-artifacts';

async function handlePOST(request: NextRequest) {
  const parsed = transferArtifactReserveSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await artifacts.reserve(await createApiContext(), parsed.data), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Reserve a transfer artifact upload
 * @tag Transfers
 * @auth bearer
 * @response 201:TransferArtifactView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
