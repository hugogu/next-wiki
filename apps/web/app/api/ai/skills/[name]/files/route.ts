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

/**
 * Skill file access (028, US4).
 *
 * The file path travels as a `?path=` query parameter rather than a catch-all
 * URL segment. It cannot be a path segment: `next.config.ts` rewrites every
 * `/:path*.md` URL to the raw-Markdown export route, which would swallow
 * `.../files/SKILL.md` before this handler ever ran. A query parameter is also
 * immune to any future extension-based routing.
 */
type Params = { params: Promise<{ name: string }> };

// Read from the standard URL rather than `nextUrl`, so the handler is exercisable
// with a plain Request in tests and depends on no Next-specific surface for
// something this simple.
function filePath(request: NextRequest): string | null {
  const value = new URL(request.url).searchParams.get('path');
  return value && value.length > 0 ? value : null;
}

/**
 * @openapi
 * @summary Read a skill file
 * @description Returns the text content of one file inside a skill, selected by
 * the `path` query parameter. Scripts are reference material and are never
 * executed.
 * @tag AI Skills
 * @auth bearer
 */
export async function GET(request: NextRequest, { params }: Params) {
  const path = filePath(request);
  if (!path) return apiError('BAD_REQUEST', 'A "path" query parameter is required', 400);
  try {
    return NextResponse.json(
      await readSkillFileForAdmin(await createApiContext(), (await params).name, path),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Create or update a skill file
 * @description Writes the file named by the `path` query parameter. `revision`
 * is required when updating an existing file and a mismatch is rejected rather
 * than overwriting.
 * @tag AI Skills
 * @auth bearer
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const path = filePath(request);
  if (!path) return apiError('BAD_REQUEST', 'A "path" query parameter is required', 400);
  const parsed = parseJson(writeSkillFileInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await writeSkillFileForAdmin(await createApiContext(), (await params).name, path, parsed.data),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Delete a skill file
 * @description Removes the file named by the `path` query parameter and records
 * the deletion in the skill's revision history. The instruction file cannot be
 * deleted.
 * @tag AI Skills
 * @auth bearer
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const path = filePath(request);
  if (!path) return apiError('BAD_REQUEST', 'A "path" query parameter is required', 400);
  try {
    await deleteSkillFileForAdmin(await createApiContext(), (await params).name, path);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
