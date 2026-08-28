import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as config from '@/server/services/translation-config';

async function handleGET() {
  try {
    return NextResponse.json({ items: await config.listTextModels(await createApiContext()) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** List text-generation models eligible for translation. Admin only. */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
