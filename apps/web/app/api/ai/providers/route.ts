import { NextResponse, type NextRequest } from 'next/server';
import { aiProviderCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { createProvider, listProviders } from '@/server/services/ai-admin';

/** @openapi @summary List AI providers @description Available to authenticated users; write operations remain administrator-only. @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json({ items: await listProviders(await createApiContext()) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** @openapi @summary Create AI provider @tag AI Admin @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiProviderCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createProvider(await createApiContext(), parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
