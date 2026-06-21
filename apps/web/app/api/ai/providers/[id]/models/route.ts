import { NextResponse, type NextRequest } from 'next/server';
import { aiModelCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createManualModel } from '@/server/services/ai-admin';

/** @openapi @summary Create manual AI model @tag AI Admin @auth bearer */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = parseJson(aiModelCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await createManualModel(await createApiContext(), (await params).id, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
