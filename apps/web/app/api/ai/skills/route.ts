import { NextResponse, type NextRequest } from 'next/server';
import { createSkillInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { createSkill, listSkillsForAdmin } from '@/server/services/skills/admin';

/**
 * @openapi
 * @summary List Agent Skills
 * @description Returns every known skill with its source and state to authenticated users, plus any
 * packages that were rejected during discovery and the status of the skills
 * directory.
 * @tag AI Skills
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await listSkillsForAdmin(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Create an Agent Skill
 * @description Creates an admin-authored skill seeded with a valid instruction
 * file. Fails when the name is already used by any known skill.
 * @tag AI Skills
 * @auth bearer
 */
export async function POST(request: NextRequest) {
  const parsed = parseJson(createSkillInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createSkill(await createApiContext(), parsed.data), {
      status: 201,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
