import { NextResponse, type NextRequest } from 'next/server';
import { feishuConfigInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { getConfigView, updateConfig } from '@/server/services/feishu-config';

/** Internal administrator endpoint; Feishu credentials are always write-only. */
export async function GET() {
  try {
    return NextResponse.json(await getConfigView(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** Save masked Feishu configuration without ever returning plaintext secrets. */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(feishuConfigInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateConfig(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
