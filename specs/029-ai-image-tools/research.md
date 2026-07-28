# Research: AI Image Tools

## Decision 1: Use the existing action/artifact lifecycle as the public workflow

**Decision**: model REST image generation as `POST` submission followed by action polling, then private artifact preview, discard, or promotion. Public/MCP submission returns `202 Accepted` and never waits for a provider. A successful action exposes a single generated artifact; promotion creates the existing content asset.

**Rationale**: `ai_actions`, `ai_action_events`, `ai_generated_artifacts`, the image worker, and `ai-artifacts` already provide a durable, retry-safe lifecycle with expiration and provenance. This matches the existing semantic-search public asynchronous pattern.

**Alternatives considered**:

- Return image bytes from `POST`: rejected because generation can outlive HTTP timeouts, leaks binary through JSON contracts, and bypasses the current lifecycle.
- Create new public image/action tables: rejected because current action and artifact records already represent exactly one generated image and preserve provenance.
- Reuse internal `/api/ai/*` routes directly: rejected because their access checks deliberately require an interactive user actor; broadening them would expose unrelated internal actions to API keys.

## Decision 2: Add a narrow `ai.image` API-key scope

**Decision**: add `ai.image` to the shared API-key scope enum and map it only to `use_ai_image_generation`. Image creation additionally requires an Editor/Admin account role, `edit` page scope, active image-generation entitlement, and an editable current page/revision. Polling, preview, discard, and promotion bind to the action/artifact owner account; promotion also rechecks page edit authority. The existing `create`/`edit` asset scopes continue to govern direct `POST /api/v1/assets` uploads.

**Rationale**: an image-generation permission is narrower and more auditable than a broad `ai.generate` permission. It follows the existing `ai.read` naming and prevents a key authorized for semantic AI reads from creating billable/provider-backed media.

**Alternatives considered**:

- Reuse `ai.read`: rejected because a read/search scope must not authorize generation.
- Use generic `run`: rejected because it does not express AI-media entitlement or least privilege.
- Permit all Editor/Admin API keys: rejected because explicit scope grant and revocation are required for externally callable AI generation.

## Decision 3: Keep provider work out of HTTP and avoid double-queueing

**Decision**: separate image-action creation from a reusable generation runner. REST and MCP create an action and enqueue the existing image job. The Wiki AI `generate_image` tool creates a child action and invokes the same runner only within the existing pg-boss AI-question worker, with normal tool/provider timeout and cancellation checks; it does not enqueue another image job.

**Rationale**: Wiki AI needs a generated artifact in the same tool loop so it can promote it and return Markdown. The outer AI-question job is already an asynchronous, governed execution context. A shared runner retains validation, provenance, entitlement, provider, artifact, and cleanup behavior in one place.

**Alternatives considered**:

- Let the Wiki AI tool poll a queued child job: rejected because no later user turn is guaranteed, so it cannot reliably generate then upload in one request.
- Perform generation in the chat HTTP request: rejected by the background-work constitution and creates request timeout/cancellation risk.
- Make a second worker/job type: rejected because it adds deployment and lifecycle complexity without new domain behavior.

## Decision 4: MCP is a thin transport over public REST

**Decision**: retain `upload_image` unchanged and add `generate_image`, `get_image_generation`, and `promote_generated_image`. The MCP API client calls only `/api/v1` contracts and returns safe status/Markdown-oriented responses.

**Rationale**: the MCP server already wraps public API resources. Keeping it transport-only makes REST/OpenAPI the authoritative contract and keeps API-key authorization and audit consistent for all external callers.

**Alternatives considered**:

- Give MCP direct database/service access: rejected because it duplicates authorization, storage, audit, and deployment concerns.
- Replace `upload_image`: rejected because callers already use its base64 upload input and Markdown output; generated-image promotion is additive.
- Add an MCP raw-byte preview tool: rejected because clients can use the authenticated preview URL and model tools should not carry binary payloads.

## Decision 5: Use artifact promotion, not page mutation, as the upload bridge

**Decision**: a generated artifact is promoted through the existing `uploadImage` path, producing a normal private content asset and its Markdown reference. Wiki AI returns that Markdown but does not insert it into page content. If a page should change, the existing draft/review tool handles it separately.

**Rationale**: this fulfills generation-and-upload without creating a bypass around the revision/review/publish model. The asset/action link is durable provenance, while the final page revision remains the Markdown source of truth.

**Alternatives considered**:

- Automatically append Markdown to a page: rejected because it silently mutates content and may publish derived material.
- Store image bytes in AI action output only: rejected because uploaded Wiki assets need normal asset lifecycle, permissions, renderer support, and orphan cleanup.
- Treat promotion as public sharing: rejected because an unreferenced asset must remain owner-private until normal page visibility rules apply.

## Decision 6: Preserve current artifact retention and use safe observability

**Decision**: reuse the configured generated-artifact retention window (current default 24 hours, bounded by existing configuration) and cleanup for expired unpromoted artifacts. Retain promoted-artifact provenance through its asset/action pointer. Add safe API audit metadata and action/tool summaries containing IDs, status, content type, size, and hashes only.

**Rationale**: current cleanup correctly separates generated transient data from promoted normal assets. Request prompts, selection text, bytes, provider payloads, credentials, and internal provider errors are not needed to operate or audit the feature.

**Alternatives considered**:

- Keep all generated bytes permanently: rejected because it increases storage/privacy exposure and conflicts with current retention behavior.
- Return a rich debug payload to API/MCP users: rejected because safe error/status contracts must not leak provider or source data.
- Add a separate audit table: rejected because API audit entries and action events already support the required actor/resource/status trace.
