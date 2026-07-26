# Phase 0 Research: Skill System & Provider-Agnostic Tool Calling

Every question below was resolved against the current codebase. No
NEEDS CLARIFICATION remains.

---

## R1. Where the provider-agnostic seam already exists, and what is missing

**Decision**: Keep `ToolPlanner` as the abstraction boundary. Add a second
planner implementation and a neutral tool channel on the provider adapter. Do
not touch `runToolLoop`, policy resolution, review, or chat events.

**Rationale**: `apps/web/src/server/services/ai-tool-runtime.ts:288` already
defines `ToolPlanner = (state: ToolTurnState) => Promise<ToolPlanStep>`, and
`runToolLoop` (line 374) consumes only that. The entire governed path — call
records, `resolveReview`, `isEnabled`, citations, cancellation, the
`limit_reached` status — is downstream of the planner and provider-blind. The
one place that knows about the fenced-YAML protocol is the inline `planner`
closure in `apps/web/src/server/jobs/ai-question.ts:332-386` plus
`parseToolPlan` in `wiki-question-tool-planner.ts`.

What is genuinely missing is on the provider side:
`AiProviderAdapter` (`apps/web/src/server/ai/types.ts:95`) exposes
`streamText(input: TextGenerationInput)` where the input is `{system, messages}`
and the events are text/usage/done only. A grep for `tool` across
`apps/web/src/server/ai/providers/` returns nothing — there is no tool support in
any adapter today.

**Alternatives considered**:
- *A new `streamToolTurn` method on the adapter.* Rejected: duplicates retry,
  usage accounting, timeout, and error normalisation that `streamText` already
  owns, and would leave two divergent streaming paths.
- *Doing the translation inside each planner rather than each adapter.* Rejected:
  the planner would need per-vendor branching, which is exactly the vendor lock-in
  P2 forbids. Translation belongs in the adapter, one implementation per wire
  format.

---

## R2. Shape of the neutral tool-call envelope

**Decision**: Three Zod schemas in `packages/shared/src/ai-tools.ts`:

- `neutralToolDefinition`: `{ name, description, inputSchema }` where
  `inputSchema` is a JSON Schema object.
- `neutralToolCall`: `{ id, name, arguments }` — `arguments` already parsed to an
  object; the adapter owns JSON parsing and reports a parse failure as a
  normalised error rather than leaking a half-parsed string upward.
- `neutralToolResult`: `{ callId, ok, content, isError }` where `content` is the
  bounded text summary the runtime already produces.

Adapter surface changes:
- `TextGenerationInput` gains `tools?: NeutralToolDefinition[]` and its
  `messages` entries gain optional `toolCalls` / `toolResults` so a multi-step
  turn can be replayed.
- `TextGenerationEvent` gains `{ type: 'tool_call'; call: NeutralToolCall }`.
- `AiProviderAdapter` gains `readonly supportsNativeTools: boolean`.

**Rationale**: This is the smallest surface that covers both wire formats.
Anthropic sends `tool_use` content blocks and expects `tool_result` blocks back
in a user message; OpenAI-compatible endpoints send `tool_calls` on the assistant
message and expect `role: "tool"` messages back. Both map onto the same triple.
Putting the schemas in `packages/shared` keeps them zero-dependency and lets the
admin UI and future MCP work reuse them (FR-009).

**Alternatives considered**:
- *Reusing the MCP tool schema verbatim.* Attractive for FR-009, and the built-in
  registry already borrows MCP tool names deliberately. But MCP's schema carries
  transport concerns we do not need. Decision: keep the envelope minimal and
  structurally MCP-compatible (name + description + JSON Schema input) so a future
  MCP provider maps 1:1 without a rewrite.
- *Streaming partial tool arguments.* Rejected for this release: the loop only
  acts on complete calls, so the adapter buffers argument deltas and emits one
  `tool_call` event per completed call. Recorded as a deliberate simplification.

---

## R3. Per-provider translation

**Decision**:

| Adapter | Native tools | Mapping |
|---|---|---|
| `anthropic.ts` | yes | `tools: [{name, description, input_schema}]`; read `content_block_start`/`input_json_delta`/`content_block_stop` for `tool_use`; results returned as `tool_result` content blocks in a user message |
| `openai-compatible.ts` | yes | `tools: [{type:'function', function:{name, description, parameters}}]`; accumulate `choices[].delta.tool_calls[]` fragments by index; results returned as `role:'tool'` messages carrying `tool_call_id` |
| `openrouter.ts` | inherited | extends `OpenAiCompatibleAdapter`; no override needed |
| `minimax.ts` | no | already overrides `streamText` as unsupported (embedding/image only); declares `supportsNativeTools = false` |
| `voyage.ts` | no | embedding-only adapter |

**Rationale**: `OpenRouterAdapter` and `MiniMaxAdapter` both extend
`OpenAiCompatibleAdapter` (`registry.ts`), so one correct implementation covers
three of five adapters. The two that cannot generate text at all simply declare
no native tool support.

**Alternatives considered**: A separate `openai-tools.ts` mixin. Rejected as
indirection without a second consumer.

---

## R4. Strategy selection and runtime downgrade

**Decision**: Two new columns on `ai_models`:

- `tool_call_strategy` (`auto` | `native` | `text`, default `auto`) — the
  Administrator override required by FR-003.
- `native_tool_call_failed_at` (nullable timestamp) — the runtime downgrade
  marker, cleared whenever an admin changes `tool_call_strategy` or the model is
  re-synced.

Resolution (`ai-tool-strategy.ts`):

```text
if strategy = 'text'            -> text
if strategy = 'native'          -> native (surface a clear error if the adapter cannot)
if strategy = 'auto':
    adapter.supportsNativeTools = false -> text
    native_tool_call_failed_at set      -> text
    otherwise                           -> native
```

A native attempt that fails with a tool-shaped provider rejection sets
`native_tool_call_failed_at` and immediately retries the same turn with the text
planner, so the user's request never fails for this reason (FR-002, spec edge
case).

**Rationale**: The existing `tool_calling` `AiCapability` already answers a
different question — *may this model drive the tool loop at all* — and
`modelSupportsToolCalling` (`ai-question.ts:101`) treats a missing row as "yes"
so text-protocol models keep working. Overloading it with strategy selection
would conflate "no tools" with "tools by text", and an admin override of
`supported=false` would wrongly disable tools entirely. A dedicated column keeps
both decisions independently testable. Note that the existing capability
resolution (`manual > provider > catalog`) stays authoritative for the *whether*;
the new column governs only the *how*.

**Alternatives considered**:
- *A new `native_tool_calling` capability enum value.* Rejected: capability rows
  are detector-owned and multi-sourced; the admin override slot (`manual`) is
  already spoken for, and a runtime downgrade would have to masquerade as a
  detector row.
- *In-memory downgrade only.* Rejected: it would be re-learned on every worker
  restart, costing a failed native attempt each time.

---

## R5. Skill package format

**Decision**: Adopt the published Anthropic layout unchanged — a directory whose
`SKILL.md` opens with YAML frontmatter declaring `name` and `description`,
followed by Markdown instructions, plus arbitrary sibling files (commonly
`reference/` and `scripts/`).

Validation on load and on save:
- `SKILL.md` present and parseable; frontmatter is a mapping.
- `name`: 1–64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, canonical identity (FR-013a).
- `description`: 1–1024 chars, non-empty after trim.
- Directory-name mismatch is loaded under the declared name and reported.

**Rationale**: FR-009/P9 and the spec assumption both call for skills authored
for other Claude-based tools to load without conversion. The `yaml` package is
already a dependency (used by the text tool protocol), so no new dependency.

**Alternatives considered**: A next-wiki-specific manifest (`skill.json`).
Rejected — it would break portability, which is the whole point.

---

## R6. Bounded directory loading (the P10 contract)

**Decision**: An explicit, bounded loading contract in `directory-loader.ts`:

| Bound | Value | Reason |
|---|---|---|
| Discovery depth | exactly one level below the root | spec: nested discovery out of scope |
| Packages per scan | 100 | keeps the scan synchronous |
| Files per package | 16 | keeps the file tree reviewable |
| Bytes per file | 64 KiB | inline viewer/editor limit (FR-037) |
| Bytes per package | 1 MiB | bounds one skill's total footprint |
| Symlinks | resolved and rejected if the real path escapes the package | FR-029 |

Each rejected entry yields `{ directory, reason, detail }`, surfaced verbatim in
the Skills admin surface (FR-025, FR-046). One bad package never aborts the scan.
A missing, unreadable, or unconfigured root yields an informational notice, not
an error (FR-028).

The registry is a module-level cached value with one explicit invalidation entry
point (`invalidateSkillRegistry()`), rebuilt lazily on next access. It is not a
mutable global: nothing outside the module can write to it, and tests construct
their own instance.

**Rationale**: P10 prohibits custom runtime filesystem discovery "unless the
feature spec defines a bounded registry and testable loading contract". The spec
does (FR-012, FR-023, FR-025, FR-028, FR-029); this table is that contract made
concrete and each row is directly testable.

**Alternatives considered**:
- *Filesystem watcher for live reload.* Rejected: adds a background watcher to the
  baseline deployment for a case the explicit rescan (FR-027) already covers.
- *Scanning at import time.* Rejected: a slow or hung mount would block startup,
  violating FR-028.

---

## R7. Where editable skill content lives

**Decision** (clarification Q3, already recorded in the spec): the application's
own PostgreSQL database.

- `skills` rows exist only for admin-authored skills and for *overrides* of
  built-in skills. Directory skills have no row — they are derived from the mount
  on each scan, which is what makes "remove it from the host and it disappears"
  true.
- `skill_settings` is keyed by skill **name**, not by row id, so enable/disable
  and `last_used_at` survive a directory skill temporarily disappearing and
  coming back.
- `skill_file_revisions` is an immutable per-save record (P8).
- Effective content resolves as: shipped package content, overlaid by any stored
  override; or the stored content in full for admin-authored skills; or the
  mounted file for directory skills.

**Rationale**: One stateful service (P1), one backup (SC-013), and the mount stays
read-only (FR-026a) so a `:ro` bind is correct rather than merely tolerated.

**Alternatives considered**: A writable `/data/skills` overlay. Rejected: it
introduces a second stateful location that must be backed up separately and
creates the exact confusion the read-only decision was meant to avoid — an admin
editing a file in the UI and finding the host copy unchanged.

---

## R8. Default enabled state for directory skills

**Decision**: Directory-sourced skills load **enabled** by default. Built-in
skills are enabled by default (FR-044). Admin-authored skills are enabled on
creation.

**Rationale**: Mounting a skill directory is already a deliberate operator act
performed with host access. Requiring a second in-app click per skill would
defeat US5's stated motivation — managing a shared library with existing tooling
— and would make SC-003's "no in-app configuration step" awkward to satisfy in
spirit. The risk is bounded by FR-023 and SC-011: a skill cannot widen
permissions or bypass review, so an unwanted skill degrades answer quality, it
does not create an authority hole.

**Judgment call flagged for the reviewer**: the more conservative reading —
mount makes a skill *visible*, an admin makes it *active* — is defensible. If
that is preferred, only the default in `skill_settings` resolution changes; no
other design decision depends on it.

---

## R9. How skills reach the model

**Decision**: Progressive disclosure through the existing tool runtime, with two
new built-in tools registered in `ai-tool-registry.ts`:

| Tool | Category | Risk | Required scope | Retention |
|---|---|---|---|---|
| `load_skill` | `read` | `read` | `use_ai_qa` | `never_full_result` |
| `read_skill_file` | `read` | `read` | `use_ai_qa` | `never_full_result` |

The enabled-skill catalogue (name + one-line description) is injected into the
tool system prompt at a new `{{SKILLS}}` placeholder, mirroring the existing
`{{TOOLS}}` mechanism in `wiki-question-tool-planner.ts` — machine-controlled, so
enabling a skill never requires editing a prompt.

**Rationale**: Making skill loading a tool call rather than a side channel buys
five requirements for free: it appears in the chat timeline (FR-019), it is
permission-checked at the same chokepoint, it is bounded by the per-turn call
limit (FR-044a), it is recorded in `ai_tool_calls` — which is how FR-024's
"which skills were loaded" is answered without a new table — and it works
identically under both tool-call strategies (FR-004).

`never_full_result` retention is correct because skill instructions are
configuration, not evidence: they must not be captured as Raw evidence when a
turn produces durable knowledge.

**Alternatives considered**:
- *Injecting the chosen skill's full text into the system prompt.* Rejected: it
  requires guessing the skill before the turn, contradicting the clarified
  model-driven selection, and it scales with catalogue size (SC-005).
- *A dedicated non-tool "skill" event type.* Rejected: it would need its own
  permission check, its own chat rendering, and its own limit — three
  reimplementations of things the tool runtime already does correctly.

---

## R10. Guaranteeing scripts are never executed

**Decision**: No code path reads a skill file into anything but a string. There
is no `child_process`, `vm`, `eval`, or dynamic `import()` anywhere in
`server/services/skills/`. Enforced by (a) `read_skill_file` returning
`{ path, contentType, content }` only, and (b) a test that asserts the skills
module tree contains no execution primitive, alongside behavioural tests per
source (SC-007).

**Rationale**: FR-020 is an absolute prohibition, so it deserves a structural
test rather than only behavioural ones — behavioural tests can only prove the
paths they exercise.

---

## R11. Admin surface placement and the editor

**Decision**: `/admin/ai/skills` as a sibling of the existing `/admin/ai/tools`
and `/admin/ai/prompts` nav entries, with detail at `/admin/ai/skills/[name]` and
the open file in a `?file=` search param.

The file editor MUST NOT be a third bespoke CodeMirror mount. Today CodeMirror
appears twice: `components/editor/SplitMarkdownEditor.tsx` and
`components/admin/appearance/CssEditor.tsx`. Extract the admin-flavoured setup
into `components/ui/CodeEditor.tsx` and refactor `CssEditor` onto it in the same
change.

**Rationale**: P6 requires all UI primitives to live in `src/components/ui/` and
prohibits copy-pasted per-feature styling; the anti-pattern list names this
explicitly. P11 requires one canonical entry point per resource and a URL for
every reachable state — hence the search param for the selected file rather than
component state.

**Alternatives considered**: A plain `<textarea>`. Rejected: skill files include
Markdown and shell/Python scripts, and the project already owns a suitable
editor — a bare textarea would be a worse experience for no saving.

---

## R12. Deployment configuration

**Decision**: Mirror the existing `CONTENT_LOCAL_*` pattern exactly:

- `SKILLS_BASE_PATH` — in-container path, default `/data/skills`.
- `SKILLS_HOST_PATH` — host bind path shown to admins for diagnostics, default
  `./.skills`.
- `docker-compose.yml` gains
  `- ${SKILLS_HOST_PATH:-./.skills}:${SKILLS_BASE_PATH:-/data/skills}:ro`.

**Rationale**: `config.ts` already establishes this exact pair for the Local
content backend, including the "informational inside the container; Docker
Compose owns the mount" comment. Reusing the pattern means no new operator
concept. The `:ro` suffix is load-bearing: it turns FR-026a from a promise into
an enforced property.

**Alternatives considered**: Multiple skill roots via a path list. Rejected —
the spec scopes this to a single root, and one root keeps conflict reporting
comprehensible.
