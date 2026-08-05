# Quickstart: Validate Cross-Space Page Migration

## Prerequisites

- A local checkout with dependencies installed.
- PostgreSQL and the application/worker started with `docker compose up -d --build`.
- An Administrator account and LLM Wiki mode enabled.
- Wiki and AI Generation pages, including one imported page, one folder with
  descendants, a translated variant, a tag, and a public published page.

## Automated validation

Run focused tests while implementing, then the full gates:

```bash
pnpm --filter @next-wiki/web test -- pages-move cross-space-migration reader-routing
pnpm --filter @next-wiki/mcp-server test
pnpm --filter @next-wiki/web openapi:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate
```

The final migration generation check must report no further schema changes.

## Scenario 1 — Page from Pages list

1. As an Administrator, open an imported Wiki page in Pages.
2. Launch migration, choose AI Generation and a destination folder, and review
   the preview.
3. Confirm it, poll until completion, then open the returned destination URL.
4. Verify page ID/history/import source remain available to authorized users,
   tags appear in the destination space, and no active Wiki copy remains.

Expected: the item reports any metadata/OKF adaptation, is not automatically
published or made more visible, and has one canonical destination address.

## Scenario 2 — Folder from Navigator

1. Use the Navigator contextual action for a folder with descendants and a
   root-page/index.
2. Review all mappings and deliberately exclude a conflicting child.
3. Confirm, refresh during execution, and inspect the final item result.

Expected: selected pages and their translations preserve relative paths; the
excluded conflict remains unchanged; the refreshed navigator has no stale
source branch.

## Scenario 3 — Route, permissions, and links

1. Move a published public page and request its former reader URL anonymously.
2. Restrict the destination page and request the former URL again.
3. Attempt preview/confirmation as a non-Administrator, with Raw, and after
   editing a page after preview.

Expected: the first old URL redirects only to the canonical public destination;
the second is opaque unavailable; unauthorized, Raw, and stale requests make
no content change or disclosure. Supported internal references continue to
work; unresolved references are reported rather than silently rewritten.

## Scenario 4 — REST and MCP parity

1. Create a preview through the versioned API, confirm it, and poll operation
   and item resources.
2. Repeat the same workflow with the MCP preview/start/status tools.
3. Repeat the same confirmation request and verify it returns the existing
   operation rather than moving a page twice.

Expected: web, REST, and MCP show equivalent authorization, preview mappings,
operation states, and final outcomes.
