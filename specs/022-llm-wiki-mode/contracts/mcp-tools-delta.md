# Contract: MCP Tools Delta

**Feature**: 022-llm-wiki-mode | **Base**: `packages/mcp-server` (30 tools, registry `src/server.ts`, client `src/api-client.ts`)

Tools wrap the v1 REST API — every change below maps 1:1 to `contracts/v1-api-delta.md`. All space-aware tools accept an optional `space` argument; the API enforces mode/permission rules, so unauthorized spaces surface as tool errors (`SPACE_UNAVAILABLE` / `SPACE_FORBIDDEN`) rather than new MCP-side logic.

## Extended tools

| Tool | Delta |
|---|---|
| `list_pages` | + `space?: 'default' \| 'raw' \| 'generated'`; + `filterType?: string` (OKF frontmatter `type`; raw input kinds are stored as `type`, so one filter covers both) |
| `search_wiki` | + `space?`; + `filterType?: string` (alongside existing `filterTag`, `filterStatus`, `filterOwner`, `filterHasFrontmatter`) |
| `get_page_tree` | + `space?` |
| `get_page` | + `space?` (disambiguates cross-space id lookups; optional since ids are unique) |
| `list_revisions`, `get_revision`, `get_backlinks`, `get_stats` | + `space?` |
| `create_page` | + `space?`; + `nature?: 'original' \| 'generated'`; + `inputKind?` + `source?` (raw creation); + `kind?: 'native' \| 'link'` + `linkTargetPageId?` (link creation). Default target space follows the API rule: **generated in LLM Wiki mode** (FR-018), wiki/default otherwise |
| `batch_create_pages` | + optional per-item `space` (same default rule) |

Page/revision results now include `kind`, `linkTarget`, `origin { actorKind, nature }`, `humanModified` (flattened by `src/shapes.ts`).

## New tool

### `append_raw_entry`

Append a new chunk to an existing raw entry (FR-020). Prior content is never modified; the server stores `current + chunk` as a new published revision.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `pageId` | uuid | yes | Raw entry page id |
| `content` | string | yes | Non-empty Markdown chunk |
| `source` | object (`channel?`, `url?`, `sessionId?`, `command?`) | no | Appended chunk's provenance metadata |

Returns: flattened revision resource (`pageId`, `versionNumber`, `revisionId`, `origin.actorKind`, `createdAt`).

Errors: `RAW_SPACE_IMMUTABLE` (not a raw entry), `SPACE_UNAVAILABLE` (copilot mode), `SPACE_FORBIDDEN` (key lacks raw access).

## Tool behavior notes for agents (README updates)

- In LLM Wiki mode, `create_page` without `space` lands in `generated`; pass `space: 'default'` explicitly to create in the public wiki space (requires publish intent).
- Raw entries are immutable: `save_draft`, `update_page_properties`, `delete_page` on raw pages fail with `RAW_SPACE_IMMUTABLE`. Use `append_raw_entry` to grow an entry.
- Typical raw filtering: `list_pages(space: 'raw', filterType: 'chat-transcript')`; generated filtering: `list_pages(space: 'generated', filterType: 'Playbook', filterTag: 'incident')`.
- `origin.actorKind` reflects the credential used for each write; `humanModified=true` means a session-authenticated human has saved at least one revision.
