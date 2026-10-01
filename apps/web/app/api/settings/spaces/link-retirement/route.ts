import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { retireLinkPages } from '@/server/services/link-pages';

export const dynamic = 'force-dynamic';

/**
 * Starts or reports the idempotent, non-destructive link-page retirement.
 *
 * @openapi
 * @summary Retire link pages
 * @description Retires every active link page without deleting the page or its revision history. Idempotent: the result reports how many pages this call retired and how many already were. Administrator session only; not callable with a Bearer key.
 * @tag Settings
 */
export async function POST() {
  try {
    return NextResponse.json(await retireLinkPages(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
