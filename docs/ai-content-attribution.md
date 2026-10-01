# Page AI content attribution

Page-level AI attribution is returned as `aiContentLevel`: `generated` for
AI-generated pages, `assisted` after a human content revision, and `null` for
human/original content. Publishing or changing a page address does not count
as a human content edit. Later machine revisions preserve human contributions.
Original Raw evidence remains unmarked even when mirrored by an agent.

All readers see the label beside the page title. This uses immutable revision
authorship, the existing page content nature, and any recorded human declaration.
The clearance migration adds an audit table; historical content needs no backfill. Saving a human draft counts as human editing.

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


## Human-authored declarations

The signed-in page author or an Administrator can clear either label using the
remove control beside it. The confirmation declares that the reviewed revision
is primarily human-authored. Other editors, anonymous readers, and API keys
(including admin-owned keys and MCP) cannot perform this action.

- `POST /api/v1/pages/{id}/ai-attribution/clearances` takes
  `{ "expectedRevisionId": "<latest revision UUID>" }`. An intervening edit
  returns `STALE_REVISION` (409), so unseen content cannot be cleared.
- `GET /api/v1/pages/{id}/ai-attribution/clearances` returns declarations to
  the signed-in author or Administrator, newest first.

Each declaration permanently records the clearing user, UTC timestamp, revision
UUID, version number, and previous label. Repeated requests for the same revision
return the existing record. Page and revision provenance stay intact. Soft deletion
of the page or revision retains the audit record.

Human edits after a declaration keep the page unmarked. A later AI revision
shows `assisted` again, and a new human declaration can clear it at that version.
Search filtering and page projections use the same effective classification.
