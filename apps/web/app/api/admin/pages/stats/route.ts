import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError } from '@/server/api/errors';
import * as pageService from '@/server/services/pages';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const stats = await pageService.getAdminPageStats(ctx);
    return NextResponse.json(stats);
  } catch {
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const dynamic = 'force-dynamic';
