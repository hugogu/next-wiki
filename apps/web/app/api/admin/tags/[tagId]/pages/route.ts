import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseParams, uuidSchema } from '@/server/api/validate';
import { listAdminTagPages } from '@/server/services/pages';

type RouteContext = { params: Promise<{ tagId: string }> };

/** Related pages for a tag in the signed-in Admin read-only scope. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tagId } = await params;
    const parsedTagId = parseParams(uuidSchema, tagId);
    if (!parsedTagId.ok) return apiError('BAD_REQUEST', formatZodError(parsedTagId.error), 400);
    const space = new URL(request.url).searchParams.get('space') ?? undefined;
    const items = await listAdminTagPages(await createApiContext(), { tagId: parsedTagId.data, space });
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
