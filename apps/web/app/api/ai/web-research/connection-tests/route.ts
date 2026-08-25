import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createWebResearchConnectionTest } from '@/server/web-research/admin';

/** @openapi @summary Queue a Web Research connection test @tag AI Admin @auth bearer */
export async function POST() {
  try {
    return NextResponse.json(await createWebResearchConnectionTest(await createApiContext()), { status: 202 });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
