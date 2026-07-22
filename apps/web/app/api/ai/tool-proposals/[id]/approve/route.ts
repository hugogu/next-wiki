import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiToolProposalDecisionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { approveProposal } from '@/server/services/ai-tool-proposals';

const idSchema = z.string().uuid();
type Params = { params: Promise<{ id: string }> };

/** @openapi @summary Approve an AI tool change proposal @tag AI Tools @auth bearer */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  const parsed = parseJson(aiToolProposalDecisionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await approveProposal(await createApiContext(), id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
