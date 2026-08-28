import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { rescanSkills } from '@/server/services/skills/admin';

/**
 * @openapi
 * @summary Rescan the skills directory
 * @description Rebuilds the skill catalogue from the mounted directory without
 * restarting the service. Bounded discovery keeps this a synchronous request.
 * @tag AI Skills
 * @auth bearer
 */
export async function POST() {
  try {
    return NextResponse.json(await rescanSkills(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
