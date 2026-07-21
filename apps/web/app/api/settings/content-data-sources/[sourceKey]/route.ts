import { NextResponse } from 'next/server';
import { contentDataSourceUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { updateDataSource } from '@/server/services/content-data-sources';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sourceKey: string }> };

/**
 * Update a Content Data Source.
 *
 * @openapi
 * @summary Update a content data source
 * @description Admin-only. Enabling a source that is currently unavailable in the active writing mode fails with `DATA_SOURCE_UNAVAILABLE` (409); disabling is always allowed.
 * @tag Settings
 * @auth bearer
 * @body ContentDataSourceUpdateInput
 * @response ContentDataSourceItem
 */
export async function PATCH(request: Request, { params }: Params) {
  const { sourceKey } = await params;
  const parsed = parseJson(contentDataSourceUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const ctx = await createApiContext();
    const item = await updateDataSource(ctx, sourceKey, parsed.data);
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
