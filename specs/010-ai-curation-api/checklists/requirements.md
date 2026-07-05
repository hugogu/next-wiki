# Specification Quality Checklist: AI Curation API

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-04
**Updated**: 2026-07-05 (consistency review pass: semantic-search scope, migration wording, error-code contract, MCP/OpenAPI counts, batch semantics)
**Feature**: [spec.md](./spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — terms like "next-open-api", "YAML", "JSON", "Zod" describe data contracts and project-shared infrastructure rather than prescribing implementation; no code structure, library choices, or languages mandated.
- [x] Focused on user value and business needs — every story is framed as an AI agent or external tool user outcome.
- [x] Written for non-technical stakeholders — requirements describe behaviors (search, filter, traverse, batch) without dictating storage, query construction, or job mechanics.
- [x] All mandatory sections completed — User Scenarios & Testing, Requirements (Functional + Key Entities), Success Criteria, Assumptions, Out of Scope are all populated.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — zero markers introduced; ambiguous spots resolved via documented Assumptions.
- [x] Requirements are testable and unambiguous — every FR has a single observable behavior (endpoint + behavior + gating).
- [x] Success criteria are measurable — SC-001 through SC-008 each include a numeric threshold, a binary pass condition, or a discoverability check.
- [x] Success criteria are technology-agnostic — no mention of Postgres, pgvector, or job frameworks in SC; wording is in terms of user-perceived latency, call count, and discoverability.
- [x] All acceptance scenarios are defined — every User Story carries 3-7 Given/When/Then scenarios covering happy path and key failures.
- [x] Edge cases are identified — 14 edge cases listed (empty wiki, dangling links, cycle, permission downgrade, expired action, polling foreign action, mixed-generation results, post-pgvector count reduction, multi-space future, etc.).
- [x] Scope is clearly bounded — explicit Out of Scope section enumerates deferred work; the Summary call-out restates it at the top; the search design rationale paragraph documents why keyword and semantic are modeled as two resources rather than one endpoint with `mode`.
- [x] Dependencies and assumptions identified — `Depends on` line in frontmatter declares 004 / 005 / 007 as upstream specs; Assumptions section documents 10 defaults (scope name, parser, link rules, batch size, scope→action mapping, etc.).

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — each FR maps to at least one Acceptance Scenario.
- [x] User scenarios cover primary flows — find / filter / semantic-find / traverse / batch are the five primary flows, each with its own story.
- [x] Feature meets measurable outcomes defined in Success Criteria — SC are individually achievable given the FR set; no SC depends on Out-of-Scope work.
- [x] No implementation details leak into specification — the spec describes capabilities and contracts, not the service modules, schema migrations, or job wiring that will realize them.

## Constitutional Alignment (informational)

- [x] **P1 Simple Deployment, Personal by Default** — FR-030 explicitly prohibits new default runtime dependency.
- [x] **P3 KB is Portable AI Memory** — FR-005 mandates grounded citations; FR-007 forbids silent fallback.
- [x] **P5 Permissions First-Class** — FR-009 is the dedicated cross-endpoint permission-filter FR (both keyword and semantic filter at query time, not deferred to client, with no existence disclosure); FR-007, FR-014, FR-019, FR-025, SC-004 all enforce permission gating at both endpoint and result level.
- [x] **P7 Async-First for Heavy Operations** — FR-004 mandates async for semantic submit; FR-020–025 force revision creation for any title/path/frontmatter change but do not require a job (single-page changes stay synchronous; batch wraps the same per-page machinery).
- [x] **P8 Version Everything** — FR-024, FR-021 enforce revision creation and soft delete.
- [x] **P9 Open Standards** — FR-026 mandates next-open-api documentation; FR-027 mandates MCP tool exposure.
- [x] **P10 Explicit Over Implicit** — the keyword / semantic split is itself a P10 application (two distinct resources rather than a hidden discriminator); FR-010 forbids the discriminated-union shape; link `source` is an explicit discriminator; batch `dry_run` is explicit.

## Anti-Pattern Self-Check

- [x] Not creating a separate table or storage path for AI-derived data — frontmatter and links are derived at query time (Assumption 8 + FR-029).
- [x] Not vendor-locking AI integration — semantic mode reuses the provider-agnostic AI registry already shipped in 004.
- [x] Not duplicating search surface area — semantic and keyword are deliberately two endpoints, not `/search` and `/search/semantic` siblings of a single verb, AND not a `mode=` flag on one endpoint. Each is its own resource.
- [x] Not conflating synchronous query with asynchronous job — explicit design rationale paragraph in the Summary justifies the split; FR-003 forbids async lifecycle on the keyword endpoint; FR-004 mandates async lifecycle on the semantic endpoint.
- [x] Not leaving a pre-existing permission leak in the codebase — FR-009 explicitly closes the pgvector-without-permission-check gap and ties it to a Q&A regression test; Assumption 9 documents the gap with file:line references and the reference implementation (`full-context.ts:55-58`).

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- This checklist validates the spec as a contract surface only; technical decomposition (which module owns each endpoint, schema migrations if any, job wiring) belongs in `plan.md`.
- The user's scope is "step 1 (unified search + frontmatter) + step 2 link/traversal/batch" — Out of Scope makes the rest of the AI curation roadmap a sibling-spec concern rather than a later amendment to this one.
- 2026-07-04 revision A: design rationale paragraph added, search FRs restructured to model keyword and semantic as two endpoints, User Story 1 split into US-1 (keyword) and US-3 (semantic), SC-008 added to lock in the discoverability requirement.
- 2026-07-04 revision B: per user follow-up on API-key access scope — FR-009 inserted as a dedicated cross-endpoint permission-filter requirement, US-1 scenario 3 strengthened, US-3 scenario 7 added, two new edge cases added, SC-004 split into endpoint-level and result-level guarantees, Assumption 9 documents the pre-existing pgvector permission gap with file:line references and ties its fix to a Q&A regression test, FR numbering shifted to 30 total.
- 2026-07-04 revision C: speckit review pass — frontmatter aligned with the 007/008 convention (added `Depends on` line, moved update history to an inline `## Update history` section, dropped the ad-hoc `Updated` frontmatter key); stale FR cross-references in the Constitutional Alignment and Anti-Pattern sections updated to the post-renumber map (FR-029 → FR-030 for "no new dependency"; FR-019–023 → FR-020–025 for batch range; FR-023, FR-020 → FR-024, FR-021 for revision/soft-delete; FR-025, FR-026 → FR-026, FR-027 for openapi/MCP; FR-009 → FR-010 for the "forbid discriminated union" clause); FR-009 sub-bullets trimmed of `visiblePageResource (line ~167 of public-content.ts)` and `full-context.ts:55-58` references (now consolidated in Assumption 9); counts corrected (14 edge cases, 10 assumptions); Assumption 10 added documenting the `ai.read` scope → `use_ai_search` action mapping.
- 2026-07-05 revision D: consistency review pass — semantic search requires `view + ai.read` so page-read filtering has a scope basis; `INDEX_NOT_READY` remains a public 409 code; plan/data-model/tasks now acknowledge the additive `apiKeyScopeEnum` migration instead of claiming no schema migration; REST `dry_run` vs MCP `dryRun` mapping is explicit; OpenAPI/MCP operation and flattener counts are corrected; batch soft-delete is described as tombstone/no-hard-delete rather than revision creation.
