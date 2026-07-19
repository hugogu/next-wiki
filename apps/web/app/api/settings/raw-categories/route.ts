import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { createCategory, listCategories } from '@/server/services/raw-categories';

export const dynamic = 'force-dynamic';

/** Admin taxonomy for raw entries. Admin-only; unavailable in Copilot mode. */
export async function GET() {
  try {
    const ctx = await createApiContext();
    return NextResponse.json({ items: await listCategories(ctx) });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

const createInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(2000).nullish(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = parseJson(createInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const ctx = await createApiContext();
    return NextResponse.json(await createCategory(ctx, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
