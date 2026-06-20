import type { AssetUploadResult } from '@next-wiki/shared';
import type { ApiError } from './client';

/**
 * Upload an image file to `POST /api/assets`. Throws a typed {@link ApiError}
 * (`{ code, message }`) on failure so callers can show localized messages.
 */
export async function uploadImage(file: File | Blob): Promise<AssetUploadResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/assets', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  const data = (await res.json().catch(() => ({}))) as AssetUploadResult | ApiError;
  if (!res.ok) {
    throw data as ApiError;
  }
  return data as AssetUploadResult;
}
