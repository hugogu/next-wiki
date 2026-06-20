import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { generateGitSshKey } from '@/server/services/git-export';

/**
 * @openapi
 * @summary Generate Git export SSH key
 * @description Generates or rotates the server Ed25519 key. The encrypted private key remains server-side; only the public key and fingerprint are returned.
 * @tag Storage
 * @auth bearer
 * @response GitSshKeyResult
 */
async function handlePOST() {
  try {
    return NextResponse.json(await generateGitSshKey(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
