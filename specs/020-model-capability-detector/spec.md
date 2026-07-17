# Feature Specification: Model Capability Detector

**Feature Branch**: `codex/020-model-capability-detector`
**Created**: 2026-07-17
**Status**: Draft
**Input**: User description: "AI的Model detector，除目前的OpenRouter外，额外支持ClouldFlare，通过以下两个API，检测各个model 的能力。 https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list 及 https://developers.cloudflare.com/api/resources/ai/subresources/models/subresources/schema/methods/get 需要抽象出Model Capability Detector这个抽象层出来，来统一不同供应商的实现。"
**Depends on**: 004-system-ai-support (AI provider administration, model catalog, capability mapping), existing OpenRouter model detection.

## Summary

Administrators need model capability discovery to work across multiple model catalog providers, not only OpenRouter. This feature introduces a provider-neutral **Model Capability Detector** concept so next-wiki can ask any supported detector for model metadata, normalize the result, and use that result consistently when synchronizing provider models.

The first additional detector source is Cloudflare AI models. Cloudflare detection uses the official model search capability to list available models and the official model schema capability to inspect a model's supported input and output shape. OpenRouter remains supported through the same detector contract instead of remaining a special-case service.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Synchronize Cloudflare Model Capabilities (Priority: P1)

As an administrator configuring Cloudflare as an AI provider, I want the system to discover Cloudflare models and infer their usable capabilities, so that I can assign text, embedding, image, vision, audio, or reasoning-capable models without manually researching each model.

**Why this priority**: Cloudflare support is the requested new provider source. Without this story, the detector abstraction has no second real implementation and administrators still need manual capability maintenance.

**Independent Test**: Configure a Cloudflare provider with valid account access, run model synchronization, and verify that discovered models are stored with stable identifiers, availability, context and token metadata when available, modality-derived capabilities, and schema-derived capability evidence.

**Acceptance Scenarios**:

1. **Given** a Cloudflare provider has valid detector credentials, **When** an administrator synchronizes its models, **Then** the model catalog is refreshed from Cloudflare and each detected model records normalized capabilities supported by the model.
2. **Given** Cloudflare exposes a schema for a listed model, **When** the detector inspects that model, **Then** input and output shape evidence is used to classify capabilities such as text generation, image output, vision input, audio input, embeddings, or other known AI capabilities.
3. **Given** Cloudflare lists a model but its schema cannot be fetched, **When** synchronization completes, **Then** the model remains available with partial catalog evidence and a non-blocking warning rather than failing the whole synchronization.
4. **Given** Cloudflare reports a deprecated or unavailable model, **When** the catalog is synchronized, **Then** the model is marked unavailable or excluded according to the configured synchronization policy without deleting administrator assignments silently.

---

### User Story 2 - Use One Detector Contract Across Providers (Priority: P1)

As a maintainer, I want OpenRouter and Cloudflare capability detection to follow one product contract, so that model synchronization, assignment validation, manual overrides, and future detectors do not each need provider-specific logic.

**Why this priority**: The main architectural request is to introduce a Model Capability Detector abstraction. This prevents vendor lock-in and aligns with the project's provider-agnostic AI principle.

**Independent Test**: Run the same synchronization workflow against an OpenRouter-backed provider and a Cloudflare-backed provider. Verify that both return the same normalized capability vocabulary and that downstream assignment validation cannot tell which detector produced the evidence except through recorded provenance.

**Acceptance Scenarios**:

1. **Given** multiple detector implementations are registered, **When** a provider is synchronized, **Then** the system chooses the appropriate detector through explicit provider configuration and produces one normalized model capability result shape.
2. **Given** an existing OpenRouter-supported provider, **When** synchronization runs after this feature, **Then** existing OpenRouter detection behavior is preserved while using the shared detector contract.
3. **Given** a future detector source is added, **When** it satisfies the detector contract, **Then** model synchronization and assignment validation work without adding a new user-facing model-management flow.
4. **Given** a detector cannot prove whether a model supports a capability, **When** results are normalized, **Then** the capability is recorded as unknown rather than assumed supported.

---

### User Story 3 - Keep Manual Overrides Safe (Priority: P2)

As an administrator, I want manually curated model capabilities to remain visible and protected during automated detection, so that provider catalog changes do not overwrite deliberate local choices.

**Why this priority**: Provider catalog metadata is imperfect. Manual maintenance is already part of the AI provider workflow and must remain the trust boundary when automatic detection is incomplete or wrong.

**Independent Test**: Manually override a model capability, run synchronization from OpenRouter and Cloudflare, and confirm that detector evidence updates only detector-owned fields while the manual override remains effective and visibly identified.

**Acceptance Scenarios**:

1. **Given** an administrator has manually set a capability on a model, **When** a detector later reports different metadata, **Then** the manual override remains effective until the administrator removes it.
2. **Given** detector evidence changes a model from supported to unsupported, **When** that model is assigned to an AI purpose through a manual override, **Then** the assignment remains visible but is flagged for administrator review rather than silently reassigned.
3. **Given** no detector is configured for a provider, **When** an administrator manages models, **Then** manual model creation and capability editing remain available.

---

### User Story 4 - Diagnose Detector Coverage and Failures (Priority: P2)

As an administrator, I want to understand which detector source produced each capability and why detection failed or was partial, so that I can fix credentials, choose another provider, or add a manual override.

**Why this priority**: Multi-provider detection increases operational ambiguity. Administrators need enough diagnosis to correct configuration without exposing secrets or raw provider responses.

**Independent Test**: Run synchronization with valid credentials, missing credentials, expired credentials, a rate-limited detector, and malformed detector responses. Verify that the UI and audit trail show safe detector status, capability provenance, and actionable normalized errors.

**Acceptance Scenarios**:

1. **Given** a detector returns complete metadata, **When** an administrator views a model, **Then** each capability identifies whether it came from provider catalog evidence, detector schema evidence, or a manual override.
2. **Given** detector credentials are missing, invalid, or expired, **When** synchronization runs, **Then** the operation fails with a safe actionable error and no provider secret is exposed.
3. **Given** one model fails schema inspection while other models succeed, **When** synchronization completes, **Then** successful models are updated and the failed model is marked with partial detection status.
4. **Given** a detector returns malformed metadata, **When** the result is normalized, **Then** invalid fields are rejected and the model is not marked with unsupported proof.

### Edge Cases

- Cloudflare model search succeeds but schema inspection fails for every model: list-level metadata is retained, schema-derived capabilities remain unknown, and the administrator sees a detector health warning.
- Cloudflare schema indicates multiple input types or multiple output types: all supported normalized capabilities are recorded; no single "primary" capability is guessed when evidence is ambiguous.
- OpenRouter and Cloudflare expose the same human-readable model name: the catalog keeps them distinct by provider and stable external identifier.
- A detector response omits context window, maximum output tokens, or embedding dimensions: the field remains unknown and can be completed manually; synchronization must not invent values from model names.
- Provider rate limiting or temporary outage occurs during synchronization: the operation reports a retryable detector failure and preserves the previous known catalog state.
- A previously detected model disappears from the provider catalog: the local model is marked unavailable or stale, existing assignments are retained for diagnosis, and dependent AI actions do not silently switch models.
- AI mode is disabled globally: no model detector performs outbound catalog or schema requests.
- A non-admin attempts to trigger model detection or view detector configuration: access is denied without exposing detector status, account identifiers, or credential presence beyond the normal admin surface.
- Provider credentials exist for runtime inference but detector credentials are absent or insufficient: model use remains possible for already configured models, while automated detection is unavailable.

## Requirements *(mandatory)*

### Functional Requirements

#### Detector Abstraction

- **FR-001**: The system MUST define a provider-neutral Model Capability Detector contract that returns normalized model identity, availability, modality, limits, capability evidence, and safe provenance for every detected model.
- **FR-002**: Detector implementations MUST use one shared capability vocabulary across all providers: text generation, embedding, image generation, vision, audio, and thinking/reasoning where evidence exists.
- **FR-003**: Capability support MUST be evidence-based. If detector metadata cannot prove support, the capability MUST be recorded as unknown rather than supported.
- **FR-004**: OpenRouter model detection MUST be migrated behind the shared detector contract without regressing existing OpenRouter-supported provider synchronization.
- **FR-005**: The system MUST explicitly register detector implementations and select them through provider configuration. Hidden filesystem discovery or implicit vendor-name loading is not allowed.
- **FR-006**: The detector contract MUST support partial success, allowing list-level model discovery to succeed while per-model capability enrichment fails for some models.
- **FR-007**: Detector results MUST include safe provenance describing which detector source and evidence type produced each capability, without storing provider secrets or raw sensitive payloads.

#### Cloudflare Detector

- **FR-008**: The system MUST support Cloudflare as a model capability detector source for Cloudflare AI providers.
- **FR-009**: The Cloudflare detector MUST list models from Cloudflare's model search capability and normalize model identifiers, display names, availability, task/category information, and deprecation state when present.
- **FR-010**: The Cloudflare detector MUST inspect each listed model's schema when available and use schema evidence to infer supported input and output modalities.
- **FR-011**: The Cloudflare detector MUST map detected schema and catalog evidence into the shared capability vocabulary used by OpenRouter and other providers.
- **FR-012**: Cloudflare detection MUST preserve account scoping so one deployment cannot accidentally read or reuse another Cloudflare account's model catalog.
- **FR-013**: Cloudflare detector failures MUST be normalized into the same safe error categories used by existing provider administration: authentication failure, permission denied, rate limited, timeout, provider unavailable, invalid response, and unsupported capability.

#### Synchronization and Administration

- **FR-014**: Model synchronization MUST call only the detector selected for the provider being synchronized and MUST NOT fall back to another detector without explicit administrator configuration.
- **FR-015**: Synchronization MUST merge detector-owned metadata while preserving administrator manual overrides and manually added models.
- **FR-016**: Synchronization MUST mark missing or deprecated models as unavailable or stale without hard deleting models or silently changing assignments.
- **FR-017**: Assignment validation MUST use the merged model capability view, where manual overrides take precedence over detector evidence and unknown detector values cannot satisfy a required capability unless the administrator explicitly confirms an override.
- **FR-018**: Administrators MUST be able to see detector coverage for a provider, including whether detection is unavailable, partial, complete, stale, or failed.
- **FR-019**: Administrators MUST be able to re-run detection for a provider and review how many models were added, updated, marked unavailable, skipped, or partially enriched.
- **FR-020**: Existing manual model creation and manual capability editing MUST remain available for every provider, including Cloudflare and OpenRouter.

#### Security, Privacy, and Operations

- **FR-021**: Only administrators with AI management permission may configure detector credentials, trigger detection, or view detector status.
- **FR-022**: Detector credentials MUST be handled with the same confidentiality guarantees as AI provider credentials: encrypted at rest, never logged, never returned to clients, and redacted from errors.
- **FR-023**: Detector calls MUST be disabled when global AI mode is disabled, and no outbound model catalog or schema request may be made in that state.
- **FR-024**: Detector operations that can exceed normal request time MUST follow the project's asynchronous operation policy and expose a resumable status instead of blocking the admin page indefinitely.
- **FR-025**: Detector cache or freshness behavior MUST not hide an explicit administrator re-run; an administrator-triggered refresh must be able to report whether it used fresh provider data or a cached safe result.
- **FR-026**: Detector errors MUST be safe for display to administrators and MUST NOT include raw provider responses containing credentials, account identifiers beyond the configured provider label, or internal stack traces.

### Key Entities *(include if feature involves data)*

- **Model Capability Detector**: A registered source of provider model metadata. It can list models, enrich capabilities, report partial failures, and normalize evidence into the shared capability vocabulary.
- **Detector Source**: The external catalog or schema authority used by a detector, such as OpenRouter or Cloudflare.
- **Detected Model**: A normalized representation of a provider model, including stable provider-scoped identity, display name, availability, limits, modalities, capability evidence, and detection freshness.
- **Capability Evidence**: The reason a capability is known, unknown, or unsupported, including provider catalog data, schema inspection, or manual override.
- **Detector Run**: One administrator-triggered or scheduled synchronization attempt, including provider scope, detector source, result counts, status, safe error code, and freshness information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can synchronize a Cloudflare provider and see normalized capability information for at least 95% of Cloudflare models whose list and schema metadata are available during the run.
- **SC-002**: 100% of existing OpenRouter model-detection regression tests continue to pass after OpenRouter is moved behind the shared detector contract.
- **SC-003**: A detector implementation test double can be registered and used by synchronization without changing assignment validation, manual override behavior, or administrator-facing model catalog flows.
- **SC-004**: In 100% of partial-failure tests, successfully detected models remain updated while failed model enrichments are reported as partial and do not corrupt existing model metadata.
- **SC-005**: In 100% of manual-override tests, administrator-provided capability overrides remain effective after OpenRouter and Cloudflare synchronization runs.
- **SC-006**: In 100% of credential and error-path tests, detector secrets are absent from logs, API responses, UI messages, and persisted run diagnostics.
- **SC-007**: Provider synchronization reports added, updated, unavailable, skipped, and partial counts for every detector run, enabling administrators to verify the result without inspecting database state.

## Assumptions

- Cloudflare is spelled as "Cloudflare" in product copy, even though the original request typed "ClouldFlare".
- The initial Cloudflare detector targets Cloudflare AI model catalog metadata only; executing Cloudflare models for inference is outside this spec unless already supported by the provider layer.
- Cloudflare account access is administrator-configured and scoped to one account per provider configuration.
- The existing OpenRouter detector key and OpenRouter provider registration flow remain available, but their internals are refactored to use the same detector contract.
- The initial shared capability vocabulary reuses the current next-wiki AI capability concepts: text generation, embedding, image generation, vision, audio, and thinking/reasoning.
- Manual capability overrides remain the highest-trust source because provider metadata can be incomplete or wrong.
- This feature does not change anonymously readable published wiki content, public metadata, public navigation, or ISR cache behavior.

## Out of Scope

- Adding a new public API for third-party clients to run detector operations.
- Auto-selecting or auto-reassigning production AI purpose models based on detector results.
- Hard deleting local models that disappear from a provider catalog.
- Detecting pricing, rate limits, billing tier, regional availability, or provider policy constraints.
- Adding non-Cloudflare detector sources beyond preserving OpenRouter behind the new contract.
- Changing AI Q&A, embedding, image generation, or text optimization behavior except where assignment validation reads normalized capabilities.
