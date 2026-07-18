# Contract: MCP Tools Delta

**Feature**: 022-llm-wiki-mode | **Base**: `packages/mcp-server` (30 tools, registry `src/server.ts`, client `src/api-client.ts`)

Tools wrap the v1 REST API — every change below maps 1:1 to `contracts/v1-api-delta.md`. Collection/search tools accept an optional `space` argument; ID-addressed tools need no new argument because UUIDs are globally unique and the API derives permissions from the resolved resource. Unauthorized spaces/resources surface as tool errors (`SPACE_UNAVAILABLE` / `SPACE_FORBIDDEN`) rather than new MCP-side logic.

## Extended tools

| Tool | Delta |
|---|---|
| `list_pages` | + `space?: 'default' \| 'raw' \| 'generated'`; + `filterType?: string` (OKF frontmatter `type`; raw input kinds are stored as `type`); + `filterTag?: string`; + `createdStart?` / `createdEnd?` ISO 8601 timestamps |
| `search_wiki` | + `space?`; + `filterType?: string` (alongside existing `filterTag`, `filterStatus`, `filterOwner`, `filterHasFrontmatter`) |
| `get_page_tree` | + `space?` |
| `get_stats` | + `space?` |
| `create_page` | + `space?`; + `nature?: 'original' \| 'generated'`; + `inputKind?` + `source?` (raw creation); + `kind?: 'native' \| 'link'` + `linkTargetPageId?` (link creation). Raw forces nature `original`; link forces `generated`. Default target space follows the API rule: **generated in LLM Wiki mode** (FR-018), wiki/default otherwise |
| `batch_create_pages` | + optional per-item `space` (same default rule) |

Page/revision results now include `kind`, permission-projected `linkTarget`, `origin { actorKind, nature }`, and `humanModified`; revision results include permission-projected nullable historical `linkTargetPageId` and raw append `source` metadata (flattened by `src/shapes.ts`). The API returns those provenance fields as null unless the key is Admin-backed, including after migration to a public wiki. A page's actor kind is from version 1, while a revision's actor kind describes that revision.

## New tool

### `append_raw_entry`

Append a new chunk to an existing raw entry (FR-020). Prior content is never modified; the server stores `current + chunk` as a new published revision.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `pageId` | uuid | yes | Raw entry page id |
| `content` | string | yes | Non-empty Markdown chunk |
| `source` | object (`channel?`, `url?`, `sessionId?`, `command?`, `occurredAt?` ISO 8601) | no | Appended chunk's provenance metadata |

Returns: flattened revision resource (`pageId`, `versionNumber`, `revisionId`, `origin { actorKind, nature }`, `source`, `createdAt`).

Errors: `RAW_SPACE_IMMUTABLE` (not a raw entry), `SPACE_UNAVAILABLE` (copilot mode), `SPACE_FORBIDDEN` (key lacks raw access), `MODE_SWITCH_IN_PROGRESS` (switch-back write barrier active).

## Tool behavior notes for agents (README updates)

- In LLM Wiki mode, `create_page` without `space` lands in `generated`; pass `space: 'default'` explicitly to create in the public wiki space (requires publish intent).
- After a list/search result returns an id, use existing ID-addressed tools (`get_page`, `list_revisions`, `get_revision`, `get_backlinks`, `get_page_outbound_links`, `get_diff`) unchanged; the server resolves and authorizes the resource's space.
- Raw entries are immutable: `save_draft`, `update_page_properties`, `delete_page` on raw pages fail with `RAW_SPACE_IMMUTABLE`. Use `append_raw_entry` to grow an entry.
- Typical raw filtering: `list_pages(space: 'raw', filterType: 'chat-transcript', createdStart: '2026-07-01T00:00:00Z')`; generated filtering: `list_pages(space: 'generated', filterType: 'Playbook', filterTag: 'incident')`.
- Page `origin.actorKind` reflects the creation credential; revision `origin.actorKind` reflects that write; `origin.nature` remains the page's stable classification; `humanModified=true` means a session-authenticated human has saved at least one revision.
- While switch-back is pending/running, read tools continue to work and all mutation tools surface `MODE_SWITCH_IN_PROGRESS`.
