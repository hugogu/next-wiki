import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pages from '@/server/services/pages';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ pageId: z.string().uuid() });
const bodySchema = z.object({ visibility: z.enum(['public', 'registered', 'restricted']) });

/** Administrator-only anonymous-read setting for one page. */
export async function PUT(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError('BAD_REQUEST', 'Invalid page id', 400);
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) return apiError('BAD_REQUEST', 'Visibility must be public, registered, or restricted', 400);
  try {
    const visibility = await pages.setVisibility(await createApiContext(), parsedParams.data.pageId, parsedBody.data.visibility);
    return NextResponse.json({ visibility });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
