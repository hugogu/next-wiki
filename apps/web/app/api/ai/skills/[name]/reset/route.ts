import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { resetSkill } from '@/server/services/skills/admin';

/**
 * @openapi
 * @summary Reset a built-in Agent Skill
 * @description Drops the stored override so the skill returns to its shipped
 * content. Edit history is retained.
 * @tag AI Skills
 * @auth bearer
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await resetSkill(await createApiContext(), (await params).name);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
