# Implementation Plan: Configurable Space Publication

**Branch**: `codex/032-space-publication` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-space-publication/spec.md`

## Summary

Make `wiki`, `generated`, and `raw` peer page locations for public visibility,
canonical addressing, navigation, and search without weakening raw immutability
or generated-content governance. The implementation adds presentation and
default-visibility settings to each stable space, resolves public pages through
a configured space prefix, and changes read permission to honor a page's
published public state rather than hard-coding generated/raw as unreadable.

It removes active link pages and `Publish as link`, then runs an auditable,
non-destructive retirement operation that soft-deletes existing links and uses
their retained historical target only for safe legacy redirects. All regular
read, API, MCP, search, export, and cache flows address the actual page.

## Technical Context

**Language/Version**: TypeScript 5.6; Node.js 20.9+ (Node 24 image runtime)

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM,
Zod, next-open-api, pg-boss, existing content-rendering and permission layers

**Storage**: PostgreSQL 16; existing content stores for source bodies and
assets; no new runtime service

**Testing**: Vitest service/route/component tests; Playwright browser tests;
OpenAPI generation; lint, typecheck, i18n validation; generated migration
no-change check

**Target Platform**: Docker Compose deployment and server-rendered web app

**Project Type**: pnpm monorepo web application with public REST and MCP
interfaces

**Performance Goals**: Public pages remain on-demand static/ISR documents;
configured-prefix lookup and public page resolution add no per-reader session
or database requirement after cache fill; configuration and visibility updates
take effect in reader/search/navigation links on the next invalidation cycle.

**Constraints**: One canonical public URL per public page; no session-aware
public document; public read requires a current published revision and public
page visibility; raw source bytes, audit data, drafts, and protected provenance
remain unavailable anonymously; raw stays append-only and generated stays
admin-curated/OKF-conformant; never hard-delete historical link data; all
schema changes use `pnpm db:generate`.

**Scale/Scope**: Three built-in spaces; one administrator Space settings page;
one settings API; one public prefix resolver; one link-retirement operation;
all browser, REST, MCP, search, cache, sitemap, Markdown export, and writing
mode coupling points updated. Static-site publishing remains a separate,
wiki-only publication decision (see Research D8).

## Constitution Check

### Pre-design gate

| Principle / mandate | Plan response | Status |
|---|---|---|
| P1 simple deployment | Reuses the application, PostgreSQL, cache tags, and existing job runner; no service or dependency is added. | Pass |
| P3 durable, governed AI memory | Generated content remains a normal versioned page. Page visibility is an explicit Admin action and never an AI auto-publication path. Raw evidence remains append-only. | Pass |
| P5 permissions first | The central permission path changes from a space-kind read bypass to public-page eligibility; every direct read, search, asset, API, and MCP result continues through it. | Pass |
| P8 version everything | Existing link rows and revisions are soft-retired, not erased. New visibility/configuration/retirement actions are auditable. | Pass |
| P9 open interfaces | REST/OpenAPI and MCP remove retired link fields and return canonical page URLs consistently. | Pass |
| P11 canonical routes | A public page has one prefix-derived URL; old prefixes and link paths become conditional redirects, never parallel documents. | Pass |
| P12 static public content | The public resolver remains anonymous and static/ISR. Private workspace readers remain separate dynamic routes. All public eligibility/path mutations invalidate old and new paths plus public data/navigation tags. | Pass |

### Post-design gate

The design keeps public rendering anonymous, cacheable, and distinct from
private workspace reading. It records historical link data before removal,
uses explicit generated migrations, does not auto-publish AI output, and
maintains a single shared URL/permission resolver. No constitutional exception
is required.

## Project Structure

### Documentation (this feature)

```text
specs/032-space-publication/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── public-routing.md
│   └── space-settings-api.md
└── tasks.md                 # created by /speckit-tasks
```

### Source Code

```text
apps/web/
├── app/
│   ├── (public)/[...path]/page.tsx                 # static canonical public resolver
│   ├── (user)/spaces/[space]/[[...path]]/page.tsx  # dynamic protected workspace reader
│   ├── (admin)/admin/spaces/page.tsx               # Admin Space settings
│   ├── api/settings/spaces/route.ts
│   └── api/settings/spaces/[spaceId]/route.ts
├── src/
│   ├── components/admin/spaces/
│   ├── components/layout/
│   ├── components/pages/
│   ├── lib/path.ts
│   ├── server/cache/public-cache.ts
│   ├── server/db/schema/{index.ts,enums.ts}
│   ├── server/db/migrations/                       # generated only
│   ├── server/permissions/index.ts
│   ├── server/services/{spaces,space-routes,pages,public-content,revisions}.ts
│   └── server/services/{link-pages,page-link-retirement}.ts
└── public/openapi.json

packages/
├── shared/src/pages.ts
└── mcp-server/src/{api-client.ts,shapes.ts,tools/create-page.ts}
```

**Structure Decision**: Extend the existing page/space service boundaries.
`spaces` owns stable space identity and presentation configuration;
`space-routes` owns prefix validation, URL generation, reverse resolution, and
legacy aliases; `page-link-retirement` owns the one-time historical transition.
The existing public reader remains the sole static reader route, while the
existing workspace route remains dynamic for protected pages. UI components
receive resolved route data rather than carrying a hard-coded three-space
union.

## Implementation Sequence

1. Generate the database migration from schema edits for space presentation
   settings, prefix aliases, and retirement reporting/redirect records. Retain
   legacy `page_kind='link'` and target columns as historical data; remove only
   active write/read contract support.
2. Add the server-owned space configuration, prefix validation, canonical URL,
   reverse route, and cache invalidation services. Seed/backfill configuration
   safely and reject collisions with built-in routes, configured prefixes, and
   pages that would become ambiguous.
3. Change central permission/read projection to use `page.visibility` plus
   publication state for anonymous reads in every space. Keep raw/generated
   authoring restrictions and protect raw original-byte assets independently.
4. Generalize the static anonymous reader, metadata, sitemap, public trees and
   search results to resolve public pages by prefix and return their canonical
   URL. Update protected workspace routes to resolve configured prefixes and
   redirect public pages to their canonical reader route.
5. Add Admin Space settings and page visibility controls; remove the link UI,
   indicators, i18n copy, and generated-page move/cache special cases.
6. Retire existing links transactionally, expose an Admin-only report, and add
   conditional legacy redirect handling. Remove dereferencing from reader,
   history, revisions, export, API, MCP, image generation, and writing-mode
   transition code.
7. Regenerate public API documentation, update MCP shapes, run all focused and
   cross-surface tests, then run the full validation gates.

## Complexity Tracking

No constitution violation or exceptional complexity is introduced.
