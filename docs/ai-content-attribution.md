# Page AI content attribution

Page-level AI attribution is returned as `aiContentLevel`: `generated` for
AI-generated pages, `assisted` after a human content revision, and `null` for
human/original content. Publishing or changing a page address does not count
as a human content edit. Later machine revisions preserve human contributions.
Original Raw evidence remains unmarked even when mirrored by an agent.

All readers see the label beside the page title. This uses immutable revision
authorship and the existing page content nature; no database migration or
historical backfill is needed. Saving a human draft counts as human editing.

MCP `create_page` defaults to generated nature even with an explicit Wiki
space. Original Raw captures retain their original nature. Human-only pages
remain unmarked.

The following retrieval endpoints accept independent inclusion flags:

- `GET /api/v1/search/pages`: `includeAiGenerated=true|false`, `includeAiAssisted=true|false`.
- `POST /api/v1/search/pages` (`kind: query`): the same flags as JSON booleans.
- `POST /api/v1/search/semantic`: the same flags as JSON booleans.
- `GET /api/v1/memory/wiki/search`: the same flags as query booleans.

Both flags default to true. Setting both to false retains human/original
content, including Raw evidence. Filters are applied before candidate limits,
ranking and pagination. Semantic result polling rechecks the current page
classification alongside permissions.

MCP `search_wiki` and `submit_semantic_search`, OpenClaw `next_wiki_search`, and
Hermes `next_wiki_memory_search` forward both flags. Hermes tool arguments use
`include_ai_generated` and `include_ai_assisted`.
