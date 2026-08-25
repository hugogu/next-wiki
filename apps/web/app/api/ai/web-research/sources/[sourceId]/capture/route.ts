import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { captureWebSource } from '@/server/web-research/capture';

const inputSchema = z.object({ actionId: z.string().uuid() });

/** @openapi @summary Preserve opened Web Research evidence as a Raw entry @tag AI @auth bearer */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const parsed = parseJson(inputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await captureWebSource(await createApiContext(), {
      actionId: parsed.data.actionId,
      sourceId: (await params).sourceId,
    }), { status: 201 });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
