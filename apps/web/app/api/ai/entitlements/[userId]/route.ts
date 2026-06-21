import { NextResponse, type NextRequest } from 'next/server';
import { aiEntitlementUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getUserEntitlements, updateUserEntitlements } from '@/server/services/ai-entitlements';

type Params = { params: Promise<{ userId: string }> };
/** @openapi @summary Get user AI entitlement @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    return NextResponse.json(await getUserEntitlements(await createApiContext(), (await params).userId));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
/** @openapi @summary Update user AI entitlement @tag AI Admin @auth bearer */
export async function PUT(request: NextRequest, { params }: Params) {
  const parsed = parseJson(aiEntitlementUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateUserEntitlements(await createApiContext(), (await params).userId, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
