import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { testWebResearchConnection } from '@/server/web-research/admin';

/**
 * @openapi
 * @summary Test a Web Research connection synchronously
 * @tag AI Admin
 * @auth bearer
 * @response WebResearchConnectionTestResult
 */
export async function POST() {
  try {
    return NextResponse.json(await testWebResearchConnection(await createApiContext()));
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
