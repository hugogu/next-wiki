# Implementation Plan: Skill System & Provider-Agnostic Tool Calling

**Branch**: `028-skill-system` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-skill-system/spec.md`

## Summary

Two deliverables on one seam.

**US1 — provider-agnostic tool calling.** Feature 026 already isolated the right
abstraction: `runToolLoop` drives a `ToolPlanner = (state) => ToolPlanStep`
function and knows nothing about how the model was asked. What is missing is a
second planner. Today the only implementation is the fenced-YAML text protocol
in `ai-question.ts`, and `AiProviderAdapter.streamText` has no notion of tools at
all. The plan extends the adapter interface with an optional neutral tool
channel, adds a native-tool-calling planner alongside the existing text planner,
and selects between them per model. Because both planners return the same
`ToolPlanStep`, policy resolution, review, audit, Raw evidence, chat events, and
truncation are untouched — which is precisely what makes FR-004 and FR-007
structurally true rather than a promise.

**US2–US6 — the Skill system.** A bounded, explicitly-registered skill registry
with three sources (shipped packages, a mounted directory, admin-authored rows),
surfaced to the model as a name + description catalogue, with full content pulled
on demand through two new built-in tools (`load_skill`, `read_skill_file`). Skill
files are browsable and editable under `/admin/ai/skills`; directory packages are
read-only and the service never writes to the mount. Three built-in skills ship
as real packages on disk: Wiki Writer, Wiki Tagger, Wiki Linker.

Nothing in the skill path is a new authority. A skill is text that reaches the
model through the existing tool runtime, so every durable change it leads to
still goes through `can()`, the review policy, and the normal revision/proposal
machinery.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor)

**Primary Dependencies**: Next.js 16 App Router + React 19.2, Drizzle ORM,
pg-boss, Zod (`@next-wiki/shared`), `yaml` (already a dependency, used for the
text tool protocol; reused for skill frontmatter), CodeMirror 6 (already used by
`CssEditor` and the Markdown editor)

**Storage**: PostgreSQL 16+. Three new tables (`skills`, `skill_files`,
`skill_file_revisions`) plus one settings table (`skill_settings`) and two new
columns on `ai_models`. No new stateful service.

**Testing**: Vitest for unit/integration (`pnpm --filter @next-wiki/web test`),
Playwright for E2E (`... test:e2e`). Provider tool conformance extends the
existing `apps/web/src/server/ai/providers/provider-conformance.test.ts`.

**Target Platform**: Linux server via Docker Compose; single `docker compose up`
baseline preserved.

**Project Type**: Web application in the existing pnpm/Turborepo monorepo.

**Performance Goals**: Directory scan bounded to complete well under 500 ms by
construction (≤100 packages, ≤64 KiB per file, ≤1 MiB per package, ≤16 files per
package), so rescan stays a synchronous admin request rather than a job. Skill
catalogue injection adds O(enabled skills) short lines to the system prompt;
loaded skill content is capped per turn.

**Constraints**: The service MUST NOT write to the skills mount (FR-026a) and
MUST NOT execute any skill script (FR-020/SC-007). Native tool calling must
degrade to the text protocol without failing the user's turn (FR-002, edge case).
Skill content must not be able to widen permissions or review policy (FR-023).

**Scale/Scope**: Personal-to-small-team deployment. ≤100 skills, ≤16 files each.
6 user stories, 54 functional requirements, 13 success criteria.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle / Mandate | Assessment |
|---|---|
| **P1 Simple Deployment** | PASS. No new stateful service. The skills mount is an optional read-only bind, defaulted like the existing `CONTENT_LOCAL_*` pair; absent or unreadable path starts normally with a notice (FR-028). Built-in skills ship inside the image, so the zero-config deployment gets Writer/Tagger/Linker with no mount at all. |
| **P2 AI-Native, Never Vendor-Locked** | PASS — this is the feature's core. The neutral tool envelope lives in `packages/shared`; every adapter translates to and from it; no vendor SDK is introduced. `AiProviderError` normalisation is reused for tool failures. Skills are plain Markdown, portable to any Claude-compatible tool. AI stays fully disableable: with no provider configured, the Skills admin surface works and no outbound call is made (FR/edge case). |
| **P3 Portable Self-Growing Memory** | PASS. Skills change *how* the assistant proposes knowledge, never how knowledge is stored. Wiki Writer produces drafts, Tagger and Linker produce proposals; provenance, citations, and Raw-evidence rules from 022/026 are unchanged. |
| **P4 Rendering Pipeline** | N/A. No renderer, transform, or content-type change. Wiki Linker proposes Markdown link edits through the normal draft path; it does not add a transform step. |
| **P5 Permissions First-Class** | PASS. Skill administration reuses the existing `manage_ai` action — no new permission axis. Skill *use* is deliberately ungated per skill (FR-022a); safety comes from FR-023/SC-011: the loaded instructions cannot widen what `can()` allows, and the two skill tools run under the initiating user's `PermCtx` like every other tool. |
| **P6 Style System & UI Consistency** | PASS with one required refactor. The skill file editor MUST NOT be a third bespoke CodeMirror mount. Extract the existing `CssEditor` CodeMirror setup into `src/components/ui/CodeEditor.tsx` and have both `CssEditor` and the skill editor consume it. |
| **P7 Async-First** | PASS. No new >500 ms synchronous path. The directory scan is bounded as above and runs lazily behind a cached registry, not on the request path for ordinary page loads. Model calls already run in the `ai-question` pg-boss job; the native planner runs inside that same job. |
| **P8 Version Everything** | PASS. `skill_file_revisions` is an immutable per-save record, mirroring the page-revision discipline. Built-in skills are stored as overrides so the shipped default is always recoverable (FR-034). Deleting a managed skill soft-deletes. |
| **P9 Open Standards** | PASS. Skill packages use the published Anthropic layout (`SKILL.md` + YAML frontmatter `name`/`description`), so a skill written for another Claude-based tool loads unchanged. Admin endpoints are REST + JSON under the existing `/api/ai/*` surface with OpenAPI JSDoc. |
| **P10 Explicit Over Implicit** | PASS **because the spec defines the bounded registry and loading contract** that P10 requires for filesystem discovery. Built-in packages are enumerated in code (`BUILTIN_SKILL_PACKAGES`), not scanned. Directory discovery is one level deep, bounded by explicit limits, validated per package, and every rejection is recorded with a reason. The registry is a request-scoped/module-cached value with an explicit invalidation entry point — not a mutable global singleton. |
| **P11 Native Navigation & Unified Entry Points** | PASS. One canonical entry point `/admin/ai/skills`, detail at `/admin/ai/skills/[name]`, selected file in a search param so the state is linkable and back/forward work. No second route to the same resource. |
| **P12 Public Reading Is Static** | N/A for the feature's own surfaces — see below. |
| **Anti-pattern: AI content second-class** | AVOIDED. Skill-driven page changes use the same `pages`/`page_revisions` write path as manual edits. `skill_files` stores skill *instructions*, not wiki content. |
| **Anti-pattern: Ungrounded self-growth** | AVOIDED. Skills cannot bypass review; FR-023 and SC-011 are enforced by construction because skills reach the model as prompt text and act only through already-governed tools. |
| **Anti-pattern: Vendor-locked AI** | AVOIDED — inverted, in fact. The neutral envelope plus the mandatory conformance suite is the remedy. |
| **Anti-pattern: Per-page bespoke styling** | AVOIDED via the `ui/CodeEditor` extraction noted under P6. |
| **API Architecture mandate** | PASS. New admin endpoints share the existing service layer and Zod schemas and go through `can()`; nothing bypasses permissions. |

**Public Content Delivery**: This feature adds no anonymously readable surface.
Skill configuration and skill file content are `manage_ai`-only and never render
into a published page. Skills reach published content only through the existing
governed path: Wiki Writer drafts and Wiki Linker link edits become drafts or
proposed revisions and change a published page only when an authorised user
publishes, which triggers the existing page-publish ISR invalidation. Wiki Tagger
proposals follow the existing tag-change invalidation for public navigation. No
new cache representation, path, or tag is introduced, and no new revalidation
call site is needed.

**AI memory / agent-mutation disclosure**: Source of truth for skill instructions
is `skill_files` (managed and built-in overrides) or the read-only mount
(directory skills); shipped defaults live in the image. Provenance for any
durable change a skill influenced is the existing `ai_tool_calls` chain — the
`load_skill` call is itself a recorded tool call, which is how FR-024 is
satisfied without a new table. Permission re-checks happen per tool call under
the initiating user's `PermCtx`, unchanged from 026. The review boundary is
unchanged: drafts/diffs for page content, `ai_tool_proposals` for tag and
metadata changes. No derived index is affected; skills do not participate in
retrieval.

**Gate result**: PASS. No violations requiring justification; Complexity Tracking
is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/028-skill-system/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── admin-skills-api.md
│   ├── tool-call-envelope.md
│   └── skill-package-format.md
├── checklists/
│   └── requirements.md  # from /speckit.clarify
└── tasks.md             # /speckit.tasks — NOT created here
```

### Source Code (repository root)

```text
packages/shared/src/
├── ai-tools.ts                       # extend: neutral tool envelope schemas
└── skills.ts                         # NEW: skill view/CRUD Zod schemas

apps/web/src/server/
├── ai/
│   ├── types.ts                      # extend: tools on TextGenerationInput,
│   │                                 #   tool_call TextGenerationEvent,
│   │                                 #   supportsNativeTools on the adapter
│   └── providers/
│       ├── anthropic.ts              # tool_use blocks <-> neutral envelope
│       ├── openai-compatible.ts      # tools/tool_calls <-> neutral envelope
│       ├── openrouter.ts             # inherits openai-compatible
│       ├── minimax.ts                # inherits or declares unsupported
│       └── provider-conformance.test.ts  # extend: tool conformance contract
├── services/
│   ├── ai-tool-planners.ts           # NEW: text + native ToolPlanner factories
│   ├── ai-tool-strategy.ts           # NEW: per-model strategy resolution
│   ├── ai-tool-registry.ts           # extend: load_skill, read_skill_file
│   ├── ai-tool-executors.ts          # extend: the two skill executors
│   ├── skills/
│   │   ├── registry.ts               # NEW: bounded registry + invalidation
│   │   ├── directory-loader.ts       # NEW: one-level scan, validation, limits
│   │   ├── package.ts                # NEW: SKILL.md parse/validate, path guard
│   │   ├── store.ts                  # NEW: managed skills + overrides + revisions
│   │   └── builtin.ts                # NEW: explicit BUILTIN_SKILL_PACKAGES list
│   └── ai-question.ts                # extend: strategy selection
├── skills/builtin/                   # NEW: shipped packages (real files)
│   ├── wiki-writer/{SKILL.md,reference/,scripts/}
│   ├── wiki-tagger/{SKILL.md,reference/,scripts/}
│   └── wiki-linker/{SKILL.md,reference/,scripts/}
├── jobs/
│   ├── ai-question.ts                # extend: pick planner, native downgrade
│   └── wiki-question-tool-planner.ts # extend: {{SKILLS}} catalogue injection
├── db/schema/
│   ├── skills.ts                     # NEW: skills, skill_files,
│   │                                 #   skill_file_revisions, skill_settings
│   ├── enums.ts                      # extend: skill enums, tool_call_strategy
│   └── index.ts                      # extend: re-export
└── config.ts                         # extend: SKILLS_BASE_PATH / SKILLS_HOST_PATH

apps/web/app/
├── (admin)/admin/ai/skills/
│   ├── page.tsx                      # NEW: catalogue
│   └── [name]/page.tsx               # NEW: file tree + editor
└── api/ai/skills/
    ├── route.ts                      # NEW: list, create
    ├── rescan/route.ts               # NEW: rescan the mount
    └── [name]/
        ├── route.ts                  # NEW: get, patch (enable), delete
        ├── reset/route.ts            # NEW: reset built-in override
        └── files/[...path]/route.ts  # NEW: read, write, delete a file

apps/web/src/components/
├── ui/CodeEditor.tsx                 # NEW primitive (extracted from CssEditor)
├── admin/appearance/CssEditor.tsx    # refactor onto ui/CodeEditor
├── admin/ai/SkillsPanel.tsx          # NEW
├── admin/ai/SkillDetail.tsx          # NEW: tree + editor + reset
└── layout/Navigator.tsx              # extend: /admin/ai/skills entry

apps/web/messages/{en,zh}.json        # extend: admin.ai.skills.*
docker-compose.yml                    # extend: skills bind mount (read-only)
```

**Structure Decision**: Existing monorepo layout, unchanged. Server-only logic
stays under `apps/web/src/server/`; the neutral tool envelope and skill DTOs go
in the zero-dependency `packages/shared`. Skill domain logic gets its own
`server/services/skills/` directory because it has four genuinely distinct
concerns (registry, directory loading, package parsing, persistence) that would
otherwise crowd one file. Built-in skill packages are real files under
`server/skills/builtin/` so they are authored, diffed, and reviewed like the
documents they are — and so the shipped default is trivially recoverable.

## Phase Notes

**Phase 0** (`research.md`): resolves how each provider expresses tools, how the
native/text strategy is selected and downgraded, how the bounded directory
loader satisfies P10, where editable skill content lives, and the enable-by-
default decision for directory skills.

**Phase 1** (`data-model.md`, `contracts/`, `quickstart.md`): tables, columns,
state transitions, validation rules; the REST contract for the admin surface;
the neutral tool-call envelope contract that every adapter must satisfy; and the
skill package format contract.

**Phase 2** (`/speckit.tasks`, not produced here): task breakdown. The intended
slicing is US1 first (the abstraction, with the conformance suite as the gate),
then US2 (registry + catalogue + the two skill tools), then US3 (the three
packages), then US4/US5 (editing, mount), then US6.
