import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiModelUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteModel, updateModel } from '@/server/services/ai-admin';

const idSchema = z.string().uuid();

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

/** @openapi @summary Delete AI model @tag AI Admin @auth bearer */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteModel(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
