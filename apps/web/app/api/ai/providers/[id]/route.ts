import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiProviderUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteProvider, getProvider, updateProvider } from '@/server/services/ai-admin';

const idSchema = z.string().uuid();
type Params = { params: Promise<{ id: string }> };

/** @openapi @summary Get AI provider @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await getProvider(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Update AI provider @tag AI Admin @auth bearer */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const parsed = parseJson(aiProviderUpdateSchema, await request.json().catch(() => ({})));
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateProvider(await createApiContext(), id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Delete an AI capability provider and its dependent configuration.
 *
 * @openapi
 * @summary Delete AI provider
 * @description Cascades through the provider's models, purpose assignments, index generations, and completed run records. Active runs prevent deletion.
 * @tag AI Admin
 * @auth bearer
 * @response 204
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteProvider(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
