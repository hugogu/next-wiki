# Quickstart: AI Image Tools

## Prerequisites

1. Check out branch `029-ai-image-tools` and install workspace dependencies.
2. Start the project dependencies with the repository’s normal Docker workflow:

   ```bash
   docker compose up -d --build
   ```

3. Configure an enabled AI provider/model with the existing `image_generation` capability and enable the image-generation entitlement for a test Editor or Admin account.
4. Create an API key owned by that account with `ai.image` and `edit` scopes. Add `create` or `edit` as appropriate when testing the existing direct `POST /api/v1/assets` upload path.
5. Create or select a page and editable revision accessible to that account.

## REST Lifecycle Smoke Test

1. Submit a valid page-bound generation to `POST /api/v1/ai/images`. Confirm `202`, a `queued` status, and a `pollUrl`; ensure the response includes no prompt/selection text or bytes.
2. Poll `GET /api/v1/ai/images/{actionId}` until it reaches `succeeded`, `failed`, `cancelled`, or `expired`.
3. For `succeeded`, request the returned preview URL with the same API key. Confirm binary image content, `Cache-Control: private, no-store`, and no anonymous access.
4. Promote through `POST /api/v1/ai/generated-artifacts/{artifactId}/asset` using the original page ID. Confirm a normal `PublicAssetResource` and Markdown output. Repeat the request and confirm it returns the same asset.
5. Confirm the page draft, revision, publication state, rendered content, embeddings, and public cache state are unchanged. Insert the Markdown only through the existing editor/draft/review flow.
6. Repeat with a different account/key, missing `ai.image`, a stale revision, and a mismatched page. Confirm safe scope/not-found/conflict responses without resource existence disclosure.

## MCP Smoke Test

1. Connect the MCP server with the same API key and verify the tool list contains `upload_image`, `generate_image`, `get_image_generation`, and `promote_generated_image`.
2. Run `generate_image`, poll with `get_image_generation`, then run `promote_generated_image` after success.
3. Verify the promotion result exposes the same Markdown as the REST asset response. Verify existing `upload_image` still accepts `imageBase64`, `filename`, and `mimeType` and returns its existing Markdown output.

## Wiki AI Smoke Test

1. As an Admin, enable the `media` category in the existing AI Tools panel; verify it can be disabled without affecting other categories.
2. Ask Wiki AI to generate an image for an editable page. Verify the AI-question job, not the HTTP request, performs provider work and records a child image action.
3. Ask it to promote the generated artifact. Verify it returns Markdown and creates a private asset, but does not alter the page.
4. Use the existing draft/review capability to place the Markdown into a page, then validate the ordinary preview/publish behavior.

## Verification Commands

Run focused suites while implementing, then run the project checks that cover edited packages. Command names may be narrowed to exact affected test files once they exist.

```bash
pnpm db:generate
pnpm --filter @next-wiki/web openapi:generate
pnpm --filter @next-wiki/web test -- ai-image-generation
pnpm --filter @next-wiki/web test -- ai-artifacts
pnpm --filter @next-wiki/web test -- ai-tool
pnpm --filter @next-wiki/mcp-server test
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/mcp-server lint
pnpm --filter @next-wiki/mcp-server typecheck
pnpm db:generate
```

The final `pnpm db:generate` must report that there are no schema changes. If source schemas changed, commit the migration and generated snapshot produced by Drizzle; never hand-write the SQL or journal. Perform the existing browser automation/manual UI check for the Admin category toggle and editor draft boundary before handoff.
