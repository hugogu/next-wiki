# Data Model: Wiki AI Tool Runtime

## Overview

This feature adds a governed tool runtime around existing AI actions, page revisions, tag metadata, and Raw evidence. Page content remains canonical in `pages` / `page_revisions`. Raw evidence remains canonical in Raw pages and their revisions. Tool records and proposals are workflow state that explain how AI reached or prepared durable changes.

## Entity: ToolProvider

Represents a configured source of tools available to Wiki AI.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `key` | string | Unique stable key; first phase uses `next-wiki` |
| `display_name` | string | Admin-facing label |
| `kind` | enum | `builtin_wiki`; future kinds may include external MCP |
| `enabled` | boolean | Built-in provider enabled by Admin policy |
| `activation_status` | enum | `available`, `disabled`, `unsupported`, `future_external` |
| `config` | JSON object | Non-secret provider settings; first phase minimal |
| `created_at` / `updated_at` | timestamp | Audit support |

Validation:

- Only the built-in provider can be activated in this phase.
- Provider keys are explicitly registered; no filesystem or network discovery.

## Entity: ToolDefinition

Registered definition for an available tool.

| Field | Type | Rules |
|---|---|---|
| `provider_key` | string | References a registered provider key |
| `name` | string | Stable MCP-compatible tool name |
| `category` | enum | `read`, `page_draft`, `metadata`, `tag`, `batch`, `raw_evidence` |
| `risk_level` | enum | `read`, `draft_write`, `reviewed_write`, `immediate_write` |
| `required_scope` | string | Permission/action needed to call |
| `result_retention` | enum | `conversation_summary`, `raw_when_durable`, `never_full_result` |
| `default_review_policy` | enum | `always_review`, `policy_review`, `allow_immediate` |
| `input_schema` / `output_schema` | schema reference | Shared Zod schema names |

Validation:

- Tool definitions are static code registrations.
- Mutating tools default to `always_review` unless Admin policy narrows by category and actor scope.

## Entity: ToolPolicy

Admin-managed settings for a provider/category/tool.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `provider_id` | UUID | Tool provider |
| `tool_name` | string nullable | Null means category/provider default |
| `category` | enum nullable | Category-level policy when `tool_name` is null |
| `enabled` | boolean | Whether the tool/category can be used |
| `review_policy` | enum | `always_review`, `review_when_requested`, `allow_immediate_for_owner` |
| `max_calls_per_turn` | integer | Bounded, positive |
| `timeout_ms` | integer | Bounded, positive |
| `updated_by` | UUID nullable | Admin user |
| `updated_at` | timestamp | Policy audit |

Validation:

- Effective policy is the strictest applicable policy.
- Disabling a category disables every tool in that category.

## Entity: ToolWorkflow

A tool-enabled chat turn linked to one AI action.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `ai_action_id` | UUID | References `ai_actions.id` |
| `actor_user_id` | UUID nullable | Initiating user copied for audit |
| `status` | enum | `queued`, `running`, `waiting_review`, `completed`, `failed`, `cancelled`, `limit_reached` |
| `max_calls` | integer | Per-turn limit snapshot |
| `call_count` | integer | Incremented as calls start |
| `created_at` / `finished_at` | timestamp | Lifecycle |

State transitions:

```text
queued -> running
running -> waiting_review
running -> completed
running -> failed
running -> cancelled
running -> limit_reached
waiting_review -> completed
waiting_review -> failed
waiting_review -> cancelled
```

## Entity: ToolCall

One assistant-requested tool invocation.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `workflow_id` | UUID | Parent workflow |
| `ai_action_id` | UUID | Parent action for event streaming |
| `provider_key` | string | Registered provider |
| `tool_name` | string | Registered tool name |
| `sequence` | integer | Unique per workflow |
| `command_markdown` | text | Bounded markdown command record |
| `arguments` | JSON object | Validated input; secrets redacted before display |
| `status` | enum | `queued`, `running`, `succeeded`, `failed`, `blocked`, `cancelled` |
| `requested_review` | enum | `none`, `admin_review` |
| `effective_review` | enum | `none`, `admin_review` |
| `result_summary` | text nullable | Safe bounded summary |
| `result_hash` | text nullable | Hash of full result when retained as evidence |
| `error_code` / `error_message` | text nullable | Safe error |
| `started_at` / `finished_at` | timestamp nullable | Lifecycle |

Validation:

- Full arbitrary result payload is not stored here.
- `command_markdown` must not contain secrets or protected content beyond what the viewer can read.
- Mutating calls must have an effective review decision.

## Entity: ToolChangeProposal

Reviewable mutation that is not represented solely by a page draft.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `workflow_id` | UUID | Source workflow |
| `tool_call_id` | UUID | Source tool call |
| `kind` | enum | `tag_update`, `metadata_update`, `batch_update`, `raw_evidence_link`, `other` |
| `title` | string | Reviewer-facing label |
| `rationale` | text | Assistant-provided reason |
| `status` | enum | `pending`, `approved`, `rejected`, `applied`, `failed`, `superseded` |
| `created_by_action_id` | UUID | AI action |
| `created_by_user_id` | UUID nullable | Initiator |
| `reviewed_by_user_id` | UUID nullable | Admin reviewer |
| `reviewed_at` | timestamp nullable | Review time |
| `applied_at` | timestamp nullable | Application time |
| `conflict_state` | JSON object | Current conflict diagnostics |

State transitions:

```text
pending -> approved
pending -> rejected
pending -> superseded
approved -> applied
approved -> failed
approved -> superseded
failed -> approved
failed -> rejected
```

Validation:

- Applying re-checks reviewer permission and item current-state hashes.
- Rejected proposals never mutate durable state.

## Entity: ToolChangeProposalItem

One resource-level before/after item within a proposal.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `proposal_id` | UUID | Parent proposal |
| `resource_kind` | enum | `page`, `tag`, `page_metadata`, `raw_category`, `link` |
| `resource_id` | UUID | Affected resource |
| `before_state` | JSON object | Bounded snapshot |
| `after_state` | JSON object | Bounded desired state |
| `base_version_id` | UUID nullable | Revision or mutation base |
| `state_hash` | text | Conflict detection |
| `apply_status` | enum | `pending`, `applied`, `failed`, `skipped` |
| `error_code` / `error_message` | text nullable | Safe error |

Validation:

- `before_state` and `after_state` are display-safe and size-bounded.
- Item apply is atomic per item unless the proposal kind defines stronger transactionality.

## Entity: ToolEvidenceLink

Relationship between a tool call, durable change, and Raw/source evidence.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `tool_call_id` | UUID | Producing call |
| `raw_page_id` | UUID nullable | Tool Evidence Raw entry |
| `source_revision_id` | UUID nullable | Existing source revision when no new Raw entry is needed |
| `target_kind` | enum | `page_revision`, `proposal`, `tag_mutation`, `metadata_change` |
| `target_id` | UUID | Durable target or proposal |
| `content_hash` | text | Evidence integrity |
| `created_at` | timestamp | Audit |

Validation:

- Exactly one of `raw_page_id` or `source_revision_id` is required.
- Required evidence must exist before a durable generated change can apply.

## Entity: Tool Evidence Raw Category

System Raw category for tool-derived evidence.

| Field | Type | Rules |
|---|---|---|
| `system_key` | string | `tool-evidence` |
| `name` | string | Tool Evidence |
| `is_retired` | boolean | Must remain usable for system evidence capture |

Validation:

- System category cannot be deleted in a way that blocks future evidence capture.
- If unavailable, durable tool-sourced changes are blocked.

## Existing Entities Extended

### AiAction

- Tool-enabled turns remain `wiki_question`; tool use is represented by a linked `AiToolWorkflow`.
- Result metadata may link to `toolWorkflowId`.
- Event stream includes tool-call lifecycle events.

### AiActionEvent

- Add event type(s) for tool-call lifecycle, proposal creation, and evidence linking.
- Payloads are bounded and safe for the initiating user.

### AiModelCapability

- Add capability `tool_calling` or equivalent model-level capability so Admin assignment can prevent unsupported tool use.

### Conversation Raw Metadata

- Include command records and safe tool-call status metadata when a captured conversation contains tool calls.
- Do not embed full arbitrary result payloads.

## Derived / Rebuildable State

- Search/semantic indexes over Tool Evidence Raw entries are derived from Raw page revisions.
- Tool result summaries are display conveniences and can be recomputed or omitted.
- Proposal conflict diagnostics are refreshed on read/apply.
