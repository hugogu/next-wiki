import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listDataSources } from '@/server/services/content-data-sources';

export const dynamic = 'force-dynamic';

/**
 * List Content > Data Sources.
 *
 * @openapi
 * @summary List content data sources
 * @description Admin-only Content > Data Sources registry. Sources unavailable in the current writing mode are still listed, marked `available: false`.
 * @tag Settings
 * @auth bearer
 * @response ContentDataSourceListResponse
 */
export async function GET() {
  try {
    const ctx = await createApiContext();
    return NextResponse.json({ items: await listDataSources(ctx) });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
