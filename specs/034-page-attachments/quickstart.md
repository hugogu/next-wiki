# Quickstart: Page Attachments

Manual verification walkthrough once the feature is implemented. Mirrors the
spec's acceptance scenarios; run against a local `docker compose up`
deployment with at least one editor/admin account.

## 1. Default configuration works out of the box (User Story 4)

1. On a fresh install (no admin change to `/admin/attachments`), open any
   page you can edit.
2. Attach a small image (e.g. a PNG < 1 MB), a PDF, and a short video clip.
3. Confirm all three appear in the page's attachment list within a few
   seconds (SC-001), each showing its original file name, size, and type.

## 2. Download works for readers (User Story 2)

1. As a different, unprivileged reader account (or signed out, if the page
   is public), open the page from step 1.
2. Click each attachment. Confirm:
   - The PDF and image open inline (browser-native viewer) — FR-014.
   - Any non-safe type (e.g. a `.zip` or `.docx`) triggers a forced "Save
     As" download instead of opening in the tab — FR-014.
   - Downloaded bytes match the originals exactly (diff or checksum) —
     SC-002.
3. As a user without read access to the page, attempt the direct attachment
   URL. Confirm it is refused (404), not a broken/blank response — SC-006.

## 3. Removal (User Story 3)

1. As the page's editor, remove one attachment.
2. Confirm it immediately disappears from the list and its download URL
   stops working for new requests.
3. As a non-editor, attempt to remove another attachment on the same page
   via the API directly; confirm it is refused.

## 4. Admin-configured limits (User Story 4)

1. Go to `/admin/attachments`. Lower the max size to something small (e.g.
   1 MB) and remove `video` from the allowed categories.
2. Attempt to attach a 5 MB file: confirm it is refused with a message
   naming the size limit (SC-003), and that no partial/truncated file shows
   up anywhere afterward (FR-011a) — check the attachment list stays
   unchanged and, if you have DB access, that no new `content_assets` row
   was created for the rejected upload.
3. Attempt to attach a video file: confirm it is refused with a message
   naming the unsupported type.
4. Confirm the image/PDF/video attached in step 1 are all still downloadable
   despite the new, stricter limits (SC-005) — pre-existing attachments are
   grandfathered.
5. Restore the original defaults.

## 5. API key / MCP permission independence (User Story 5)

1. Issue an API key with `edit` and `create` scopes but **not**
   `attachments`. Call `POST /api/v1/pages/{pageId}/attachments` with it.
   Confirm 403 — holding edit/create alone is not enough (FR-007, SC-004).
2. Add the `attachments` scope to the same key (keep `edit`/`create`). Retry
   the same call against a page the key can read. Confirm success.
3. Using the same key, target a page it has no read access to (e.g. a
   restricted/admin-only page). Confirm the attach attempt is refused even
   though the key holds `attachments` (FR-007a).
4. Without any scope change, call `GET /api/v1/pages/{pageId}/attachments`
   and `GET /api/v1/attachments/{id}/content` using an API key that has only
   `view` scope (no `attachments` scope). Confirm both succeed for a page
   the key can read (FR-003b, SC-007) — reading needs no special scope.
5. Repeat steps 1-4 through the MCP tools (`attach_file`,
   `list_attachments`, `download_attachment`) using an MCP client configured
   with the same API key, and confirm identical outcomes — the same
   permission chokepoint applies regardless of entry point.

## 6. No in-app preview (FR-013)

Confirm there is no "preview" button, embedded viewer, or modal anywhere in
the attachment UI — only download / open-inline-via-browser as exercised in
step 2.
