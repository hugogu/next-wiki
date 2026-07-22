# UI Contract: Wiki AI Tool Runtime

## Admin AI Tools

Canonical route: `/admin/ai/tools`

Visible to Admin users only.

Required views:

- Provider list with built-in `next-wiki` provider.
- Tool/category table with enabled state, risk, required permission, result retention, and review policy.
- Policy editor for enable/disable, review policy, max calls per turn, and timeout.
- Disabled/future external-provider state that clearly shows external MCP activation is not available in this phase.
- Recent tool failures or policy blocks with safe diagnostics.

Navigation:

- Tools appears once under the existing AI admin category.
- No duplicate writable settings entry elsewhere.
- Route state for filters/tabs is encoded in URL query parameters.

## Chat Tool Timeline

Surface: existing Wiki AI chat window and retained conversation detail.

Required states:

- Tool call queued/running.
- Tool call succeeded with safe summary.
- Tool call failed/blocked/cancelled.
- Tool loop limit reached.
- Proposal created with link.
- Evidence created/linked with permission-filtered link.

Display rules:

- Show tool name and command markdown.
- Do not show full arbitrary result payloads.
- Redact secrets and permission-restricted content.
- Preserve command markdown and safe status metadata in retained conversations.
- Re-check permissions when replaying a retained conversation.

## Proposal Review

Canonical route: `/admin/ai/tools/proposals/{id}`

Visible to Admin users with relevant permission.

Required content:

- Proposal title, kind, status, source workflow/action, source tool call.
- Assistant rationale.
- Requested review and effective review.
- Itemized affected resources.
- Before/after state per item.
- Conflict state and refresh/apply guidance.
- Evidence links with permission-filtered visibility.
- Approve, reject, and apply controls based on proposal state.

Interaction rules:

- Approving does not apply unless the UI explicitly invokes apply.
- Applying re-checks conflicts and permissions and reports per-item results.
- Rejecting records a note and leaves durable state unchanged.

## Public Content Behavior

- Public readers never see pending tool proposals.
- Public readers never see chat tool-call timelines.
- Public readers see page changes only after the normal approved mutation/publish path completes.
- Existing public page layout and static/ISR behavior remain unchanged.
