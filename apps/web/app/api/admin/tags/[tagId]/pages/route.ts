import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listAdminTagPages } from '@/server/services/pages';

type RouteContext = { params: Promise<{ tagId: string }> };

/** Related pages for a tag in the signed-in Admin read-only scope. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tagId } = await params;
    const space = new URL(request.url).searchParams.get('space') ?? undefined;
    const items = await listAdminTagPages(await createApiContext(), { tagId, space });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
