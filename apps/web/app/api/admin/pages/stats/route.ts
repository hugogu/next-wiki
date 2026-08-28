import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError } from '@/server/api/errors';
import * as pageService from '@/server/services/pages';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { logger } from '@/server/logger';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const stats = await pageService.getAdminPageStats(ctx);
    return NextResponse.json(stats);
  } catch (error) {
    logger.exception('get admin page stats failed', error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const dynamic = 'force-dynamic';
