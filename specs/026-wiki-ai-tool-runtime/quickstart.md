# Quickstart: Wiki AI Tool Runtime

## Prerequisites

- Local dependencies installed with `pnpm install`.
- Test database and services available through the normal project setup.
- AI provider configured with a text model that supports tool calling, plus an alternative text model without tool calling for fallback tests.
- LLM Wiki mode available if validating Raw Tool Evidence behavior.

## Setup

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/mcp-server test
```

For full-stack validation:

```bash
docker compose up -d --build
pnpm --filter @next-wiki/web test:e2e
```

## Scenario 1: Admin Configures Tools

1. Sign in as Admin.
2. Open `/admin/ai/tools`.
3. Confirm the built-in `next-wiki` provider is visible.
4. Disable the tag category.
5. Ask Wiki AI to rename or merge a tag.

Expected outcome:

- The assistant does not call disabled tag tools.
- The chat shows a safe unavailable explanation.
- Tool-management change appears in audit.
- Non-admin users cannot open `/admin/ai/tools`.

## Scenario 2: Read-Only Tool Loop

1. Enable read tools.
2. Ask Wiki AI: "Find pages related to payment routing and summarize the current structure."
3. Watch the chat timeline.

Expected outcome:

- The assistant calls read tools in visible steps.
- Each step shows command markdown and status.
- The final answer cites readable pages.
- A user without access to one matching page never sees that page in tool output or citations.

## Scenario 3: Page Change Requires Review

1. Enable page-draft tools with Admin review required.
2. Ask Wiki AI to improve a page section.
3. Open the generated draft/proposal link.

Expected outcome:

- No published content changes immediately.
- A draft or proposed revision exists.
- Existing diff view shows before/after source changes.
- Approval/application creates normal revision/history/audit records.

## Scenario 4: Tag Change Proposal

1. Enable tag tools with Admin review required.
2. Ask Wiki AI to retag several pages.
3. Open `/admin/ai/tools/proposals/{id}`.
4. Approve and apply the proposal.

Expected outcome:

- Proposal lists every affected page/tag with before/after state.
- Applying re-checks current state and permission.
- Conflicts are surfaced instead of silently overwriting.
- Rejected proposals leave durable state unchanged.

## Scenario 5: Tool Evidence for Durable Knowledge

1. Enable Raw Tool Evidence category.
2. Ask Wiki AI to use tool output to create or update durable knowledge.
3. Inspect the resulting page/proposal.

Expected outcome:

- The durable change links to Tool Evidence Raw entry or an existing source revision.
- If evidence capture is unavailable, the durable change is blocked.
- Users lacking Raw access cannot discover the evidence through chat, search, proposals, or metadata.

## Scenario 6: Conversation Retention

1. Enable AI Conversations capture.
2. Run a tool-enabled chat.
3. Open the retained conversation / Raw Conversation page.

Expected outcome:

- Tool command markdown and safe statuses are retained.
- Full arbitrary result payloads are absent by default.
- Permission changes after the chat are respected when replaying the conversation.

## Scenario 7: Unsupported Model Fallback

1. Select a model without tool-calling capability for Wiki AI.
2. Ask Wiki AI to perform a tool-requiring task.

Expected outcome:

- The chat reports tool use unavailable for the selected model.
- No hidden tool operation executes.
- Ordinary Q&A still works when possible.

## Verification Checklist

- Run `git diff --check`.
- Run unit/integration tests for shared schemas, services, and API routes.
- Run Playwright tests for Admin Tools, chat timeline, proposal review, and public-content non-change before approval.
- Regenerate OpenAPI after route/schema annotations are implemented.
