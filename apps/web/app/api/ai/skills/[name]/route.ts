import { NextResponse, type NextRequest } from 'next/server';
import { updateSkillInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import {
  deleteSkill,
  getSkillForAdmin,
  setSkillEnabledForAdmin,
} from '@/server/services/skills/admin';

/**
 * @openapi
 * @summary Get an Agent Skill
 * @description Returns one skill with its complete file tree.
 * @tag AI Skills
 * @auth bearer
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    return NextResponse.json(await getSkillForAdmin(await createApiContext(), (await params).name));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Enable or disable an Agent Skill
 * @description Applies to every source. A disabled skill is not listed to the
 * model and cannot be loaded.
 * @tag AI Skills
 * @auth bearer
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const parsed = parseJson(updateSkillInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const ctx = await createApiContext();
    return NextResponse.json(
      await setSkillEnabledForAdmin(ctx, (await params).name, parsed.data.enabled),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Delete an Agent Skill
 * @description Soft-deletes an admin-authored skill. Built-in skills are reset
 * rather than deleted; directory-sourced skills are removed on the host.
 * @tag AI Skills
 * @auth bearer
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await deleteSkill(await createApiContext(), (await params).name);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
