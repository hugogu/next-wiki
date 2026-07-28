# Wiki AI Tool Contract

## Static Tools

| Tool ID | Category | Input | Result | Side effect |
| --- | --- | --- | --- | --- |
| `generate_image` | `media` | Existing page/revision-bound source and optional aspect ratio | Safe ready artifact ID, MIME type, size, expiry, and preview reference; or safe failure | Creates a child image action and generated artifact. |
| `promote_generated_image` | `media` | Artifact ID and bound page ID | Existing asset ID and Markdown reference | Promotes artifact through normal asset upload. |

No Wiki AI raw-base64 upload tool is added: the model does not possess caller image bytes, while generated-image promotion is the safe upload bridge for this feature.

## Execution Model

1. The AI-question job resolves static tool configuration, caller actor, page/revision context, and current permissions as it already does for all tool calls.
2. `generate_image` validates the same page/selection input as the public service, creates a child image action, and runs the common generation runner within the existing pg-boss AI-question worker. It uses normal cancellation/deadline checks and never enqueues a duplicate image job.
3. On success, the tool returns only safe artifact metadata. On failure/cancellation, it returns a stable safe error and does not expose prompt/source text, binary content, provider credentials, or raw provider diagnostics.
4. `promote_generated_image` verifies artifact ownership, page match, editor authority, entitlement, and live page/revision before using existing promotion/upload behavior. It returns ordinary Markdown for a later content-draft operation.
5. A separate existing `save_draft` invocation is the only way to add that Markdown to a page. Existing review and publish controls then apply normally.

## Policy and Review Boundary

- Add the `media` category to the shared tool taxonomy, Drizzle enum, Admin AI Tools panel, and translations so an Admin can enable or disable image tools independently.
- Define both tools with the existing immediate-operation review policy and apply a non-page-mutation review floor. Generating/promoting a private asset is not a content revision or publication.
- When the calling flow explicitly requires review or policy blocks an immediate action, do not create a bypass proposal or auto-promote. Return the existing policy-required/pending result and let the approved workflow resume it.
- The static registry remains allowlisted: no user-provided tool names, arbitrary URLs, shell commands, or provider invocation escape the registered executors.

## Authorization and Provenance

- Use the resolved request actor and current page/revision context; never trust model-generated identifiers alone.
- Require the same Editor/Admin, page-edit, image-entitlement, provider-capability, and tenant/owner constraints as the internal image service.
- Record child action/events and standard artifact-to-asset linkage. Tool-call audit/event payloads include safe IDs, status, content type/size, and hashes only.
- The image’s source is the existing page/revision or validated selection. It is not external captured evidence, so no raw-evidence row is created. The later page revision, if any, owns the Markdown reference under the normal source-of-truth model.

## Required Verification

Add focused tests for registry visibility/category filtering, disabled category behavior, role/scope/page checks, inline-runner cancellation, safe result redaction, promotion idempotency, and the invariant that a successful generation/promotion leaves page revision and publication unchanged. Add an editor-flow browser check showing returned Markdown can enter the existing draft/review flow rather than appearing in content automatically.
