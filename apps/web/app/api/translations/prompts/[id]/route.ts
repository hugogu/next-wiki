import { NextResponse, type NextRequest } from 'next/server';
import { translationPromptUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, uuidSchema } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as config from '@/server/services/translation-config';

function badId() {
  return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
}

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return badId();
  try {
    return NextResponse.json(await config.getPrompt(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return badId();
  const parsed = translationPromptUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await config.updatePrompt(await createApiContext(), id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return badId();
  try {
    await config.retirePrompt(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get a translation prompt style with versions
 * @tag Translations
 * @auth bearer
 * @response TranslationPromptDetail
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Add a new immutable version to a prompt style
 * @tag Translations
 * @auth bearer
 * @response TranslationPromptDetail
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
/**
 * @openapi
 * @summary Retire a translation prompt style
 * @tag Translations
 * @auth bearer
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
