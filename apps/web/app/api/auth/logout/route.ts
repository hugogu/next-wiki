import { NextResponse } from 'next/server';
import { internalError } from '@/server/api/errors';
import * as authService from '@/server/services/auth';
import { logger } from '@/server/logger';

/**
 * Sign out.
 *
 * @openapi
 * @summary Sign out
 * @description Destroys the current session.
 * @tag Auth
 * @auth bearer
 * @response OkResponse
 */
export async function POST() {
  try {
    await authService.logout();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.exception('logout failed', error);
    return internalError();
  }
}
