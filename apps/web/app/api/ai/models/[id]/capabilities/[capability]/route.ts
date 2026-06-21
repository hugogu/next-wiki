import { NextResponse, type NextRequest } from 'next/server';
import { aiCapabilityOverrideSchema, aiCapabilitySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { removeCapabilityOverride, setCapabilityOverride } from '@/server/services/ai-admin';

type Params = { params: Promise<{ id: string; capability: string }> };

/** @openapi @summary Override AI model capability @tag AI Admin @auth bearer */
export async function PUT(request: NextRequest, { params }: Params) {
  const values = await params;
  const capability = aiCapabilitySchema.safeParse(values.capability);
  const parsed = parseJson(aiCapabilityOverrideSchema, await request.json().catch(() => ({})));
  if (!capability.success || !parsed.ok) {
    return apiError('BAD_REQUEST', !parsed.ok ? formatZodError(parsed.error) : 'Invalid capability', 400);
  }
  try {
    await setCapabilityOverride(
      await createApiContext(),
      values.id,
      capability.data,
      parsed.data.supported,
      parsed.data.details ?? {},
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Remove AI model capability override @tag AI Admin @auth bearer */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const values = await params;
  const capability = aiCapabilitySchema.safeParse(values.capability);
  if (!capability.success) return apiError('BAD_REQUEST', 'Invalid capability', 400);
  try {
    await removeCapabilityOverride(await createApiContext(), values.id, capability.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
