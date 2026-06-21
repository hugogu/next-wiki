import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getIndex } from '@/server/services/ai-index';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/** @openapi @summary List AI index page states @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const id = (await params).id;
  try {
    await getIndex(ctx, id);
    const items = await db
      .select({
        pageId: schema.aiPageIndexStates.pageId,
        path: schema.pages.path,
        title: schema.pages.title,
        status: schema.aiPageIndexStates.status,
        attempts: schema.aiPageIndexStates.attempts,
        errorCode: schema.aiPageIndexStates.lastErrorCode,
        errorMessage: schema.aiPageIndexStates.lastErrorMessage,
      })
      .from(schema.aiPageIndexStates)
      .innerJoin(schema.pages, eq(schema.aiPageIndexStates.pageId, schema.pages.id))
      .where(eq(schema.aiPageIndexStates.generationId, id));
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
