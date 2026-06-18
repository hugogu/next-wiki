import { NextResponse } from 'next/server';
import { revisionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as revisionService from '@/server/services/revisions';

/**
 * Publish a revision.
 *
 * @openapi
 * @summary Publish a revision
 * @description Publishes the specified draft revision.
 * @tag Revisions
 * @auth bearer
 * @body RevisionInput
 * @response RevisionView
 */
export async function POST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(revisionInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await revisionService.publish(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
