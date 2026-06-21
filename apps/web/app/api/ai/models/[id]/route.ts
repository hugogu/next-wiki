import { NextResponse, type NextRequest } from 'next/server';
import { aiModelUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { updateModel } from '@/server/services/ai-admin';

/** @openapi @summary Update AI model @tag AI Admin @auth bearer */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = parseJson(aiModelUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateModel(await createApiContext(), (await params).id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
