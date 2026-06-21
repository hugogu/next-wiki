import { NextResponse, type NextRequest } from 'next/server';
import { aiAssignmentUpdateSchema, aiPurposeSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { assignPurpose } from '@/server/services/ai-admin';

/** @openapi @summary Assign AI purpose model @tag AI Admin @auth bearer */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ purpose: string }> }) {
  const purpose = aiPurposeSchema.safeParse((await params).purpose);
  const parsed = parseJson(aiAssignmentUpdateSchema, await request.json().catch(() => ({})));
  if (!purpose.success || !parsed.ok) {
    return apiError('BAD_REQUEST', !parsed.ok ? formatZodError(parsed.error) : 'Invalid purpose', 400);
  }
  try {
    return NextResponse.json(await assignPurpose(
      await createApiContext(),
      purpose.data,
      parsed.data.modelId,
      {
        confirmCapability: parsed.data.confirmCapability,
        embeddingDimensions: parsed.data.embeddingDimensions,
      },
    ));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
