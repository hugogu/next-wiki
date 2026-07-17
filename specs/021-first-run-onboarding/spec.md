# Feature Specification: First-Run Onboarding

**Feature Branch**: `codex/021-first-run-onboarding`
**Created**: 2026-07-17
**Status**: Draft
**Input**: User description: "为首次启动添加初始化引导页面，帮忙用户更方便快捷地启用整个项目。需要包括注册Admin账号、[可选]配置OpenRouter作为Model Detector （同时自动启用Chat/Embedding/Image Generation）的能力，最后询问用户是否生成示例及帮助页面。现在项目里已经有一个welcome页面了，可以再补充一下，添加上介绍Markdown语法的，及主要功能介绍的页面作为示例页面。"
**Depends on**: 001-core-wiki-platform (registration, roles, page authoring, welcome page), 004-system-ai-support (AI provider administration, purpose assignments, user AI entitlements), 020-model-capability-detector (OpenRouter detector contract and model capability evidence).

## Summary

New self-hosted operators need a guided path from an empty deployment to a usable personal wiki. This feature adds a first-run onboarding flow that appears only before an administrator account exists. The flow creates the initial Admin account, optionally configures OpenRouter as a model capability detector and AI provider bootstrap source, and asks whether to generate built-in example and help pages.

The onboarding flow must leave the wiki fully usable when the operator skips AI configuration. When the operator provides OpenRouter credentials, the system should use detected model capabilities to enable the core AI setup for chat, embeddings, and image generation wherever compatible models are available, while clearly reporting any purpose that still needs manual selection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create the First Admin Account (Priority: P1)

As a new operator opening a fresh next-wiki deployment, I want a guided first-run page to create the initial Admin account, so that I can start using and administering the wiki without knowing the normal registration rules.

**Why this priority**: The first Admin account is the gate to every later setup step. Without this flow, the operator must infer how first-account promotion works from the regular registration page.

**Independent Test**: Start with a deployment that has no users, open the site, complete the first-run account form, and verify that the created user is signed in as Admin and the onboarding flow cannot be reopened as an anonymous setup path.

**Acceptance Scenarios**:

1. **Given** no Admin account or user account exists, **When** a visitor opens the site, **Then** they are directed to a first-run onboarding page rather than the normal public wiki home.
2. **Given** the first-run page is open, **When** the operator submits valid account details, **Then** the system creates exactly one Admin account and signs the operator in.
3. **Given** an Admin account already exists, **When** any visitor opens the first-run onboarding URL directly, **Then** the setup flow is unavailable and does not expose account or configuration details.
4. **Given** invalid account details are submitted, **When** validation fails, **Then** the operator sees actionable errors and no partial Admin account is created.

---

### User Story 2 - Optionally Configure OpenRouter AI Bootstrap (Priority: P1)

As the initial Admin, I want onboarding to optionally configure OpenRouter as the model detector and AI bootstrap source, so that chat, embedding, and image generation can become usable without visiting several separate admin screens.

**Why this priority**: AI-native setup is central to the product, but it must remain optional. A guided OpenRouter step gives operators a fast path while preserving the no-AI baseline.

**Independent Test**: Complete first-run onboarding once with the OpenRouter step skipped and once with valid OpenRouter credentials. Verify that the skipped path completes with AI disabled, and the configured path detects compatible models, assigns available AI purposes, enables the Admin's relevant AI access, and reports any missing capability without blocking the wiki.

**Acceptance Scenarios**:

1. **Given** the initial Admin chooses to skip OpenRouter configuration, **When** onboarding completes, **Then** the wiki is usable and no outbound model detection, chat, embedding, or image-generation call is made.
2. **Given** the initial Admin provides valid OpenRouter credentials, **When** they continue, **Then** the system verifies the credentials, detects available model capabilities, and stores a protected system-wide AI configuration.
3. **Given** compatible OpenRouter models are detected for chat, embeddings, and image generation, **When** onboarding completes, **Then** those AI purposes are configured and the initial Admin can use the corresponding features subject to normal permissions.
4. **Given** OpenRouter detection succeeds but one AI purpose has no compatible detected model, **When** onboarding completes, **Then** the configured purposes are enabled and the missing purpose is reported as needing manual admin setup.
5. **Given** OpenRouter credentials are invalid, expired, rate limited, or lack required access, **When** verification runs, **Then** the operator can retry, edit the credentials, or skip AI setup without losing the created Admin account.

---

### User Story 3 - Choose Example and Help Pages (Priority: P2)

As the initial Admin, I want onboarding to ask whether to generate sample and help pages, so that I can start with useful Markdown and product guidance instead of an empty wiki.

**Why this priority**: Sample content reduces time-to-value but should not be forced into deployments that want a clean knowledge base.

**Independent Test**: Complete onboarding with sample pages enabled and verify that a welcome page, a Markdown syntax guide, and a main features guide are published and navigable. Complete onboarding with sample pages disabled and verify that no optional sample/help pages are added beyond required infrastructure.

**Acceptance Scenarios**:

1. **Given** the initial Admin chooses to generate examples, **When** onboarding completes, **Then** the wiki contains a published welcome page, a Markdown syntax guide, and a main features overview page.
2. **Given** the existing welcome page seed is present, **When** examples are generated, **Then** the welcome page is enriched with onboarding-oriented links to the Markdown guide and feature overview without creating duplicate welcome entries.
3. **Given** the initial Admin declines examples, **When** onboarding completes, **Then** the wiki does not create optional Markdown or feature-help pages.
4. **Given** example pages are generated, **When** a visitor or signed-in reader opens them, **Then** they render as normal published wiki pages using the same page history, permissions, Markdown rendering, and navigation as user-authored pages.

---

### User Story 4 - Resume and Diagnose Interrupted Setup (Priority: P2)

As an operator, I want the onboarding flow to survive refreshes and recover from partial setup failures, so that a network or provider issue does not leave the deployment in an ambiguous state.

**Why this priority**: First-run setup often happens during deployment verification. Clear recovery prevents support burden and protects the first Admin account from duplicated or broken setup attempts.

**Independent Test**: Refresh the browser during each onboarding step, submit the account step twice, interrupt OpenRouter verification, and retry example generation. Verify that completed steps remain completed, duplicate records are not created, and the operator always sees the next safe action.

**Acceptance Scenarios**:

1. **Given** the Admin account step completed and the browser refreshes, **When** the operator returns, **Then** onboarding resumes at the AI setup or example-page step while preserving the single Admin account.
2. **Given** OpenRouter verification is interrupted, **When** the operator retries, **Then** the flow either completes detection or reports a safe retryable error without duplicating provider configuration.
3. **Given** example page generation partially succeeds, **When** the operator retries, **Then** existing generated pages are reused or updated idempotently rather than duplicated.

### Edge Cases

- Two browsers open first-run onboarding concurrently: only one Admin account can be created; the other session is moved out of setup once the account exists.
- An Admin account exists but AI has never been configured: first-run onboarding remains closed; AI setup continues through the normal Admin configuration surface.
- OpenRouter credentials are valid but model detection returns partial metadata: purposes with proven compatible models may be configured, while unknown capabilities require manual Admin confirmation.
- OpenRouter provides multiple compatible models for a purpose: onboarding selects a safe default only when the detector marks compatibility unambiguously; otherwise it asks the Admin to choose or leaves the purpose for manual setup.
- The operator skips AI and later wants AI: the normal Admin AI settings remain the canonical place to configure providers, detectors, purpose assignments, and entitlements.
- Example page paths collide with user-created pages: onboarding never overwrites user-authored content silently and reports which pages were skipped or need manual review.
- The deployment is restored from backup with existing users and pages: first-run onboarding does not run.
- AI mode is globally disabled by environment or admin policy: onboarding may collect no OpenRouter settings and must explain that AI can be configured later only after AI mode is allowed.
- Sample pages include advanced Markdown blocks that fail to render fully: the page remains readable and shows the same graceful rendering behavior as normal wiki content.

## Requirements *(mandatory)*

### Functional Requirements

#### First-Run Availability and Admin Account

- **FR-001**: The system MUST detect an uninitialized deployment as one with no existing user account or Admin account eligible to administer the instance.
- **FR-002**: The system MUST direct uninitialized deployments to a first-run onboarding flow before exposing normal authenticated administration.
- **FR-003**: The first-run onboarding flow MUST create exactly one initial Admin account from validated operator-provided credentials.
- **FR-004**: The system MUST prevent the first-run account creation step from creating duplicate Admin accounts under concurrent submissions or browser retries.
- **FR-005**: After the first Admin account is created, the system MUST close public access to the first-run account creation path.
- **FR-006**: The initial Admin MUST be signed in after successful account creation and able to continue setup without re-authenticating.
- **FR-007**: Account validation errors MUST be shown before account creation and MUST NOT leave partial users, sessions, or elevated roles behind.

#### Optional OpenRouter AI Bootstrap

- **FR-008**: The onboarding flow MUST present OpenRouter AI setup as optional and allow the initial Admin to skip it.
- **FR-009**: Skipping OpenRouter setup MUST leave all non-AI wiki capabilities operational and MUST NOT make outbound AI provider, detector, embedding, chat, or image-generation calls.
- **FR-010**: When the initial Admin provides OpenRouter credentials, the system MUST validate them before saving them as an active AI bootstrap configuration.
- **FR-011**: OpenRouter credentials collected during onboarding MUST receive the same confidentiality guarantees as credentials entered through normal AI administration: protected at rest, never displayed in full after saving, never logged, and redacted from errors.
- **FR-012**: Successful OpenRouter onboarding MUST configure OpenRouter as the model detector source for initial model capability discovery.
- **FR-013**: Successful OpenRouter onboarding MUST detect model capabilities before assigning models to chat, embedding, or image-generation purposes.
- **FR-014**: The system MUST automatically enable chat, embedding, and image-generation purposes only when compatible models are detected or safely selected by the initial Admin.
- **FR-015**: If one or more AI purposes cannot be configured automatically, onboarding MUST complete with a clear Admin-facing summary of the configured purposes and the remaining manual setup.
- **FR-016**: AI feature access enabled during onboarding MUST respect existing role and permission rules and MUST NOT grant page read or edit permissions beyond the Admin role.
- **FR-017**: The onboarding flow MUST allow the initial Admin to retry, edit, or skip OpenRouter setup after validation, provider, rate limit, timeout, or partial-detection failures.
- **FR-018**: OpenRouter setup through onboarding MUST remain consistent with normal AI administration, so future changes are managed from the canonical Admin AI settings rather than a second setup surface.

#### Example and Help Pages

- **FR-019**: The onboarding flow MUST ask the initial Admin whether to generate optional sample and help pages before setup completion.
- **FR-020**: When examples are enabled, the system MUST provide a published welcome page that introduces next-wiki and links to generated help pages.
- **FR-021**: When examples are enabled, the system MUST provide a published Markdown syntax guide covering headings, emphasis, lists, links, images, tables, code blocks, math, diagrams, and internal wiki links.
- **FR-022**: When examples are enabled, the system MUST provide a published main features overview covering page authoring, revision history, publishing, navigation, search, AI chat, embeddings, image generation, imports/exports, and administration at a high level.
- **FR-023**: Generated sample/help pages MUST be normal wiki pages with standard paths, published revisions, author attribution, permissions, rendering, search/index eligibility, and version history.
- **FR-024**: Example generation MUST be idempotent: retrying onboarding or example generation MUST NOT create duplicate pages.
- **FR-025**: Example generation MUST NOT silently overwrite user-authored pages with colliding paths; collisions MUST be reported and skipped or require explicit Admin confirmation.
- **FR-026**: Declining examples MUST prevent creation of optional Markdown syntax and feature overview pages.

#### Completion, Recovery, and Navigation

- **FR-027**: The onboarding flow MUST show a final summary containing Admin account status, AI setup status, configured AI purposes, skipped or failed AI steps, and sample/help page generation status.
- **FR-028**: The final onboarding step MUST provide a clear path into the wiki home and relevant Admin settings for any incomplete AI setup.
- **FR-029**: Refreshing or reopening the setup flow after a completed step MUST resume at the next incomplete step or show completion, without repeating side effects.
- **FR-030**: Once setup is complete, normal wiki routes MUST become the primary entry points; onboarding MUST NOT remain as a duplicate long-term Admin configuration surface.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- This feature may add or update anonymously readable published page bodies when the initial Admin chooses to generate example/help pages.
- Generated welcome, Markdown syntax, and main feature overview pages MUST use the normal published-page cache representation for page body and public metadata.
- Creating, updating, publishing, declining, or skipping generated example pages MUST invalidate the affected page paths and public navigation so anonymous readers see the correct sample content and page list.
- Personalized onboarding controls and Admin-only setup status MUST NOT be embedded in the cached published page bodies.

### Key Entities *(include if feature involves data)*

- **First-Run Setup State**: The deployment's initialization status, derived from whether an Admin account exists and which onboarding steps have completed.
- **Initial Admin Account**: The first administrative user created through onboarding, holding full system administration rights.
- **OpenRouter Bootstrap Configuration**: Optional protected setup information used to validate OpenRouter, detect model capabilities, and configure initial AI purposes.
- **AI Purpose Setup Result**: The per-purpose outcome for chat, embeddings, and image generation, including configured, skipped, unavailable, or needs manual setup.
- **Sample Page Set**: The optional published pages generated during onboarding: welcome, Markdown syntax guide, and main features overview.
- **Onboarding Completion Summary**: The final operator-facing record of completed setup choices, generated content, and remaining manual actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a fresh deployment, an operator can create the first Admin account and reach the wiki home in under 2 minutes.
- **SC-002**: 100% of direct attempts to open first-run account creation after an Admin exists are blocked without exposing setup internals.
- **SC-003**: With valid OpenRouter credentials and compatible detected models, an operator can complete Admin creation plus AI bootstrap for chat, embeddings, and image generation in under 5 minutes.
- **SC-004**: When OpenRouter setup is skipped or fails, 100% of non-AI wiki read, author, and admin workflows remain usable after onboarding.
- **SC-005**: In concurrent first-run account creation tests, exactly one Admin account is created and no duplicate elevated accounts appear.
- **SC-006**: In 100% of credential error-path tests, OpenRouter secrets are absent from logs, UI error messages, page content, and persisted diagnostics visible outside credential storage.
- **SC-007**: When example generation is selected, the welcome, Markdown syntax, and main features pages are reachable from normal wiki navigation and render successfully in both anonymous and signed-in reading contexts.
- **SC-008**: In retry and refresh tests across all onboarding steps, completed side effects are not duplicated and the operator always sees a recoverable next action.
- **SC-009**: At least 90% of first-time operators in usability testing can identify where to continue manual AI setup from the onboarding completion summary when automatic setup is incomplete.

## Assumptions

- "Chat" in the request means the existing Wiki AI question/chat capability governed by the system AI support feature.
- "Embedding" means assigning an embedding-capable model for semantic indexing and retrieval, not immediately embedding every page synchronously during onboarding.
- "OpenRouter as Model Detector" means OpenRouter is used for initial model capability discovery and compatible AI purpose setup; ongoing management remains in the normal Admin AI settings.
- The first-run flow appears only for uninitialized deployments. It is not a replacement for normal registration, login, user management, or AI settings after setup.
- OpenRouter is optional because the project constitution requires the wiki to remain fully usable without a live AI provider.
- Generated example pages are English by default unless the deployment's active locale or future localization settings provide localized page bodies.
- The existing welcome page seed is retained as the canonical welcome entry and enriched when example generation is selected.
- Sample/help page content is product documentation, not AI-generated content, and can be reviewed or edited by the Admin after creation.

## Out of Scope

- Adding new model detector providers beyond using OpenRouter in this onboarding flow.
- Replacing the existing Admin AI settings, model catalog, purpose assignment, or entitlement management screens.
- Automatically enabling AI features for non-Admin users.
- Running a full knowledge-index rebuild synchronously during onboarding.
- Importing external documentation or user data during first-run setup.
- Creating a team, organization, invitation, or multi-tenant setup wizard.
