import { NextResponse, type NextRequest } from 'next/server';
import { feishuRegistrationStartInputSchema } from '@next-wiki/shared';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { beginFeishuAppRegistration } from '@/server/services/feishu-app-registration';

/**
 * @openapi
 * @summary Start Feishu QR application registration
 * @tag Feishu Admin
 * @auth bearer
 * @description Starts a server-held device-code flow; the device code and App Secret are never returned.
 */
export async function POST(request: NextRequest) {
  const parsed = parseJson(
    feishuRegistrationStartInputSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await beginFeishuAppRegistration(await createApiContext(), parsed.data),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
