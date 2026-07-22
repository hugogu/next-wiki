# API Contract Delta: Wiki AI Tool Runtime

All routes use the existing session/API error envelope, permission checks, and generated OpenAPI documentation conventions. Public v1 exposure is deferred unless an endpoint is explicitly marked as external-facing during implementation planning.

## Admin Tool Settings

### `GET /api/ai/tools`

Lists visible tool providers, tools, and effective policies for Admins.

Response:

```json
{
  "providers": [
    {
      "key": "next-wiki",
      "displayName": "next-wiki",
      "kind": "builtin_wiki",
      "enabled": true,
      "activationStatus": "available"
    }
  ],
  "tools": [
    {
      "providerKey": "next-wiki",
      "name": "search_wiki",
      "category": "read",
      "riskLevel": "read",
      "requiredScope": "view",
      "enabled": true,
      "reviewPolicy": "always_review",
      "resultRetention": "raw_when_durable"
    }
  ]
}
```

Errors:

- `FORBIDDEN`: caller is not Admin.

### `PATCH /api/ai/tools/policies`

Updates Admin-managed policy for a provider/category/tool.

Request:

```json
{
  "providerKey": "next-wiki",
  "category": "tag",
  "toolName": null,
  "enabled": true,
  "reviewPolicy": "always_review",
  "maxCallsPerTurn": 8,
  "timeoutMs": 30000
}
```

Response: updated policy resource.

Rules:

- External providers cannot be enabled in this phase.
- Mutating categories cannot be set less restrictive than their system minimum.
- Policy changes are audit logged.

## Tool-Enabled Chat Submission

### `POST /api/ai/questions`

Existing route accepts an additive `tools` option.

Request delta:

```json
{
  "question": "Find duplicated payment-routing docs and propose a cleanup",
  "mode": "retrieval",
  "tools": {
    "enabled": true,
    "requestedReview": "admin_review"
  }
}
```

Response remains the accepted AI action envelope:

```json
{
  "id": "action-id",
  "feature": "wiki_question",
  "status": "queued",
  "eventsUrl": "/api/ai/actions/action-id/events"
}
```

Rules:

- If tools are omitted or unavailable, route keeps ordinary Q&A behavior.
- If tools are requested but the model cannot call tools, return a recoverable unavailable result.
- Tool-enabled actions are captured by AI Conversations with command records when capture is enabled.

## Action Events

### `GET /api/ai/actions/{id}/events`

Adds event payload shapes:

```json
{
  "type": "tool_call",
  "payload": {
    "toolCallId": "uuid",
    "sequence": 1,
    "providerKey": "next-wiki",
    "toolName": "search_wiki",
    "commandMarkdown": "```tool-call\nsearch_wiki q=\"payment routing\"\n```",
    "status": "running",
    "requestedReview": "none",
    "effectiveReview": "none"
  }
}
```

```json
{
  "type": "tool_call",
  "payload": {
    "toolCallId": "uuid",
    "sequence": 1,
    "status": "succeeded",
    "resultSummary": "3 readable pages matched",
    "proposalId": null,
    "evidencePageId": null
  }
}
```

```json
{
  "type": "tool_proposal",
  "payload": {
    "proposalId": "uuid",
    "status": "pending",
    "title": "Retag 4 payment routing pages",
    "url": "/admin/ai/tools/proposals/uuid"
  }
}
```

Rules:

- Events are safe to show to the initiating user after permission filtering.
- Full arbitrary tool results are never sent through action events.

## Proposals

### `GET /api/ai/tool-proposals`

Admin list of proposals, filterable by status, kind, provider, actor, and date.

### `GET /api/ai/tool-proposals/{id}`

Returns proposal header, items, source tool call, evidence links, conflict state, and audit summary.

### `POST /api/ai/tool-proposals/{id}/approve`

Marks a pending proposal approved.

Request:

```json
{
  "note": "Reviewed tags and page list"
}
```

Rules:

- Admin only.
- Does not mutate durable state unless `applyImmediately` is explicitly supported later.

### `POST /api/ai/tool-proposals/{id}/reject`

Rejects a pending/approved proposal with a note.

### `POST /api/ai/tool-proposals/{id}/apply`

Applies an approved proposal.

Rules:

- Admin only.
- Re-checks permission and conflict state.
- Returns item-level results.
- Public page changes invalidate public content exactly like manual edits.

## Error Codes

Add or reuse these domain errors:

| Code | Meaning |
|---|---|
| `TOOLS_DISABLED` | Tool runtime disabled by Admin policy |
| `TOOL_NOT_ENABLED` | Requested tool or category disabled |
| `TOOL_CAPABILITY_UNAVAILABLE` | Selected model cannot call tools |
| `TOOL_POLICY_REVIEW_REQUIRED` | Immediate apply blocked; proposal created instead |
| `TOOL_LOOP_LIMIT_REACHED` | Per-turn call limit reached |
| `TOOL_RESULT_TOO_LARGE` | Result cannot be retained/displayed directly |
| `TOOL_EVIDENCE_REQUIRED` | Durable change blocked until Raw evidence exists |
| `PROPOSAL_CONFLICT` | Current state no longer matches proposal base |
| `PROPOSAL_NOT_APPLICABLE` | Proposal is not in a state that can be applied |

## OpenAPI Requirements

- All new request/response schemas are exported from `apps/web/src/server/api/openapi-schemas.ts`.
- Public/generated OpenAPI artifacts are regenerated after route annotations change.
- Internal Admin-only APIs can remain outside public v1 but must still share Zod schemas.
