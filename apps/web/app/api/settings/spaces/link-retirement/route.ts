import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { retireLinkPages } from '@/server/services/link-pages';

export const dynamic = 'force-dynamic';

/** Starts or reports the idempotent, non-destructive link-page retirement. */
export async function POST() {
  try {
    return NextResponse.json(await retireLinkPages(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
