import type { PublicAttachmentResource } from '@next-wiki/shared';
import { apiDelete, apiGet, type ApiError } from './client';

/**
 * Attach a file to a page: `POST /api/v1/pages/{pageId}/attachments`. Throws
 * a typed {@link ApiError} (`{ code, message }`) on failure, matching
 * `uploadImage` in `assets.ts`.
 */
export async function attachFile(pageId: string, file: File): Promise<PublicAttachmentResource> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`/api/v1/pages/${encodeURIComponent(pageId)}/attachments`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  const data = (await res.json().catch(() => ({}))) as PublicAttachmentResource | ApiError;
  if (!res.ok) {
    throw data as ApiError;
  }
  return data as PublicAttachmentResource;
}

export async function listAttachments(pageId: string): Promise<PublicAttachmentResource[]> {
  const result = await apiGet<{ items: PublicAttachmentResource[] }>(
    `/api/v1/pages/${encodeURIComponent(pageId)}/attachments`,
  );
  return result.items;
}

export async function removeAttachment(attachmentId: string): Promise<void> {
  await apiDelete<void>(`/api/v1/attachments/${encodeURIComponent(attachmentId)}`);
}
