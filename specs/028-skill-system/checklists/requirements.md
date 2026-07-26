# Specification Quality Checklist: Skill System & Provider-Agnostic Tool Calling

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Resolved by clarification (see spec `## Clarifications`)

1. **Skill name uniqueness** (2026-07-26) — duplicate names are forbidden
   outright rather than resolved by a shadowing precedence rule, so no user or
   model can act on the wrong skill (FR-014, FR-015, FR-016, SC-010).
2. **MCP scope** (2026-07-26) — MCP support was removed from this feature
   entirely. The feature is now the Skill system plus the provider-agnostic
   tool-call abstraction; the existing Tools section in AI settings keeps its
   current name and scope. Recorded in `## Out of Scope`; FR-009 preserves the
   extension point so a future MCP feature does not have to rework the tool-call
   envelope, permission model, or review model.

   The spec directory was renamed from `028-mcp-skill-system` to
   `028-skill-system` at this point.

3. **Skill invocation** (2026-07-26) — purely model-driven from the presented
   descriptions; no picker, no command syntax, no admin binding to AI actions
   (FR-019a, SC-012, `## Out of Scope`).
4. **Editable-skill storage** (2026-07-26) — all edits live in the application's
   own datastore; the skills mount is never written to and can stay read-only
   (FR-026a, FR-032a, FR-032b, SC-013).
5. **Skill run scope** (2026-07-26) — conversational only, bounded by the
   existing per-turn tool-call limit; background and whole-space runs stay with
   the curation surface (FR-044a, FR-044b, `## Out of Scope`).
6. **Skill authorisation** (2026-07-26) — any user with AI access may load any
   enabled skill; enablement is the only control. Safe because a skill confers
   no authority (FR-022, FR-022a, FR-023, SC-011).

### Resolved by documented default, not asked

- **Skill identity** — the `name` declared in the instruction file is canonical;
  a directory whose name disagrees is loaded under the declared name and the
  mismatch is reported (FR-013a). Low uncertainty, so it did not warrant one of
  the five clarification slots.

### Deferred to planning

- Concrete numeric limits — per-turn skill content budget, file size ceiling for
  the inline viewer, tool-result truncation thresholds. The spec requires each
  limit to exist and be recorded when hit (FR-006, FR-021, FR-037); the values
  are a planning decision.
- The shape of the tool-call conformance suite (FR-008) and which existing
  provider adapters must be migrated first.
