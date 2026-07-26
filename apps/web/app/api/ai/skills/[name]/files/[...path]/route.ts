import { NextResponse, type NextRequest } from 'next/server';
import { writeSkillFileInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import {
  deleteSkillFileForAdmin,
  readSkillFileForAdmin,
  writeSkillFileForAdmin,
} from '@/server/services/skills/admin';

type Params = { params: Promise<{ name: string; path: string[] }> };

/**
 * @openapi
 * @summary Read a skill file
 * @description Returns the text content of one file inside a skill, including
 * scripts. Scripts are reference material and are never executed.
 * @tag AI Skills
 * @auth bearer
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { name, path } = await params;
  try {
    return NextResponse.json(
      await readSkillFileForAdmin(await createApiContext(), name, path.join('/')),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Create or update a skill file
 * @description Writes one file. `revision` is required when updating an
 * existing file and a mismatch is rejected rather than overwriting.
 * @tag AI Skills
 * @auth bearer
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const parsed = parseJson(writeSkillFileInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  const { name, path } = await params;
  try {
    return NextResponse.json(
      await writeSkillFileForAdmin(await createApiContext(), name, path.join('/'), parsed.data),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Delete a skill file
 * @description Removes one file and records the deletion in the skill's
 * revision history. The instruction file cannot be deleted.
 * @tag AI Skills
 * @auth bearer
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { name, path } = await params;
  try {
    await deleteSkillFileForAdmin(await createApiContext(), name, path.join('/'));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
