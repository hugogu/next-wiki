# Tool Contract: Wiki AI Tool Runtime

The first phase exposes only the built-in `next-wiki` provider. Tool names and input/output shapes follow the existing MCP server vocabulary where possible so future MCP providers can share the same runtime surface.

## Common Tool Call Envelope

Input provided by the assistant:

```json
{
  "toolName": "search_wiki",
  "arguments": {},
  "requestedReview": "none"
}
```

Server-computed fields:

```json
{
  "toolCallId": "uuid",
  "providerKey": "next-wiki",
  "sequence": 1,
  "effectiveReview": "admin_review",
  "commandMarkdown": "```tool-call\nsearch_wiki q=\"...\"\n```"
}
```

Rules:

- `requestedReview` values: `none`, `admin_review`.
- `effectiveReview` values: `none`, `admin_review`.
- Effective review can be stricter than requested review for non-Admin actors.
- Admin-initiated mutations resolve to `none`; they remain permission-checked, audited, and reversible without a self-review proposal.
- Command markdown is retained in Conversation records.
- Full result payloads are not retained in Conversation records by default.

## Built-in Tool Categories

| Category | Example tools | Risk | Default review |
|---|---|---|---|
| `read` | `search_wiki`, `get_page`, `list_pages`, `get_backlinks`, `get_neighborhood` | Read-only | none |
| `page_draft` | `create_page`, `save_draft`, `update_page_metadata` | Draft write | admin_review |
| `tag` | `list_tags`, `create_tag`, `rename_tag`, `delete_tag`, `merge_tag` | Non-page mutation | admin_review |
| `metadata` | `update_page_properties`, page tag replacement | Non-page/page metadata mutation | admin_review |
| `batch` | `batch_update_pages`, `batch_soft_delete_pages` | Multi-resource mutation | admin_review |
| `raw_evidence` | create Tool Evidence Raw entry, link evidence | Evidence write | policy_review |

## Tool Result Semantics

Tool results are classified by use:

| Result use | Conversation retention | Raw evidence requirement |
|---|---|---|
| Transient chat reasoning only | command + safe status + summary | Not required |
| Citation to existing page/revision | command + safe status + source reference | Existing source revision is sufficient |
| New external or generated source material used for durable knowledge | command + safe status + evidence link | Required |
| Mutating proposal | command + safe status + proposal link | Required only if proposal rationale depends on new tool output |

## Command Markdown

Command records use a bounded fenced form:

```markdown
```tool-call
provider: next-wiki
tool: search_wiki
review: none
args:
  q: payment routing
  space: default
```
```

Rules:

- Secrets and hidden configuration values are never rendered.
- Arguments containing protected content are replaced by safe summaries when viewed later by a user without permission.
- Large arguments are summarized with hashes.

## Review Policy

Policy resolution order:

1. System minimum for tool risk.
2. Provider policy.
3. Category policy.
4. Tool-specific policy.
5. Assistant requested review.

The strictest applicable decision wins.

## Evidence Policy

Evidence is required when:

- A new page, generated concept, or public content update cites a tool result not already present in a page/Raw revision.
- A tag or metadata proposal rationale depends on a tool result not already present in a page/Raw revision.
- The assistant uses a tool result as a factual source for durable knowledge.

Evidence is not required when:

- A tool result only helps decide the next read operation.
- The final answer is transient and not persisted as durable knowledge.
- The tool result is an existing permitted page/revision that is already canonical.

## Future External MCP Provider Compatibility

The built-in provider publishes provider-aware metadata that a future external
provider must mirror so it reuses the same policy, risk, permission, retention,
and review surface with no runtime discovery:

- `apps/web/src/server/services/ai-tool-registry.ts` — `buildBuiltinToolMetadata()`
  returns the provider identity plus every tool's full contract.
- `packages/mcp-server/src/tool-metadata.ts` — the MCP-compatible manifest of the
  same tool vocabulary; `tool-metadata.test.ts` guards that these names stay
  aligned with the MCP server's registered tools.

Future providers must supply:

- Provider identity and trust/risk classification (`kind`, `activation_status`).
- Tool definitions with category, risk, required scope, input/output schemas,
  timeout, and result-retention policy — every field explicit, none implicit.
- A secret-management model.
- Permission and evidence semantics equivalent to the built-in provider.

External provider **kinds** are modeled and visible now (`external_mcp`,
`activation_status: future_external`) but cannot be activated in this phase: the
policy service rejects enabling any non-built-in provider
(`EXTERNAL_PROVIDER_NOT_ACTIVATABLE`), and the Admin Tools UI shows the external
provider as unavailable.

This phase stores provider identity and policy but does not activate external provider execution.
