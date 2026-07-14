import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getConfigView } from '@/server/services/feishu-config';

/** Internal administrator endpoint; Feishu credentials are always write-only. */
export async function GET() {
  try {
    return NextResponse.json(await getConfigView(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
