import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import {
  cancelFeishuAppRegistration,
  checkFeishuAppRegistration,
} from '@/server/services/feishu-app-registration';

type RouteContext = { params: Promise<{ registrationId: string }> };

/**
 * @openapi
 * @summary Poll Feishu QR application registration
 * @tag Feishu Admin
 * @auth bearer
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { registrationId } = await params;
    return NextResponse.json(
      await checkFeishuAppRegistration(await createApiContext(), registrationId),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Cancel Feishu QR application registration
 * @tag Feishu Admin
 * @auth bearer
 * @response 204
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { registrationId } = await params;
    await cancelFeishuAppRegistration(await createApiContext(), registrationId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
