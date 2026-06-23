import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { clearIcon, getIcon, getSiteView, setIcon } from '@/server/services/site-settings';

/**
 * @openapi
 * @summary Get the site icon
 * @description Serves the configured site icon, or redirects to the shipped default.
 * @tag Appearance
 */
export async function GET(request: NextRequest) {
  try {
    const icon = await getIcon();
    if (!icon) {
      return NextResponse.redirect(new URL('/icon.svg', request.url));
    }
    return new NextResponse(new Uint8Array(icon.data), {
      headers: {
        'content-type': icon.mime,
        'cache-control': 'no-cache',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Upload the site icon
 * @description Uploads a custom site icon (SVG/PNG/ICO). Requires the manage_appearance capability.
 * @tag Appearance
 * @auth bearer
 */
export async function PUT(request: NextRequest) {
  const ctx = await createApiContext();
  let bytes: Buffer;
  let mime: string;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return apiError('BAD_REQUEST', 'A file field is required', 400);
    }
    bytes = Buffer.from(await file.arrayBuffer());
    mime = file.type;
  } catch {
    return apiError('BAD_REQUEST', 'Invalid multipart form data', 400);
  }
  try {
    await setIcon(ctx, bytes, mime);
    return NextResponse.json(await getSiteView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Remove the custom site icon
 * @description Reverts the site icon to the shipped default. Requires the manage_appearance capability.
 * @tag Appearance
 * @auth bearer
 */
export async function DELETE() {
  try {
    await clearIcon(await createApiContext());
    return NextResponse.json(await getSiteView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
