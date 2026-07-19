import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { deleteCategory, retireCategory, updateCategory } from '@/server/services/raw-categories';

export const dynamic = 'force-dynamic';

const updateInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullish(),
  isDefault: z.boolean().optional(),
  // Retiring is a distinct lifecycle move handled by the retire service path.
  isRetired: z.literal(true).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = parseJson(updateInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const ctx = await createApiContext();
    const category = parsed.data.isRetired
      ? await retireCategory(ctx, id)
      : await updateCategory(ctx, id, parsed.data);
    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** Hard delete; rejected with RAW_CATEGORY_HAS_ENTRIES (409) while entries still
 * reference the category — the admin retires it (PATCH isRetired) instead. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const ctx = await createApiContext();
    await deleteCategory(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
