# Project Structure

**Status**: Constitutionally binding. Referenced by Core Principle P9 (Explicit
Over Implicit) in `.specify/memory/constitution.md`.
**Change control**: This layout is NON-NEGOTIABLE. AI agents MUST NOT generate a
different directory structure. Any deviation requires a constitution amendment.

```text
next-wiki/
|-- apps/
|   `-- web/                        # Next.js full-stack application
|       |-- app/                    # App Router routes and route shells
|       |   |-- (public)/           # Public content pages (SSR + SEO)
|       |   |-- (auth)/             # Login / register
|       |   |-- (admin)/            # Admin dashboard
|       |   |-- (editor)/           # Page editor
|       |   `-- api/
|       |       |-- trpc/[trpc]/    # tRPC HTTP handler
|       |       |-- v1/             # Public REST route handlers
|       |       `-- mcp/            # Optional MCP transport handlers
|       `-- src/
|           |-- server/             # Server-only code
|           |   |-- trpc/           # tRPC routers and procedures
|           |   |-- rest/           # REST adapters and OpenAPI metadata
|           |   |-- mcp/            # MCP tool adapters
|           |   |-- services/       # Business logic layer
|           |   |-- db/             # Drizzle schema + migrations
|           |   |-- auth/           # Better Auth integration
|           |   |-- pipeline/       # Rendering pipeline (remark/rehype)
|           |   |-- ai/             # Optional AI provider and retrieval layer
|           |   `-- jobs/           # pg-boss job definitions
|           |-- client/             # Client-only code
|           |-- components/
|           |   |-- ui/             # Unified design system: Mantine wrappers, tokens, shared visual assets
|           |   |-- admin/          # Admin dashboard components
|           |   |-- editor/         # Editor components (Tiptap)
|           |   |-- chat/           # AI chat side pane components
|           |   `-- common/         # Shared components (navigation, breadcrumbs, layout)
|           `-- hooks/              # Custom React hooks
|-- packages/
|   |-- shared/                     # Zod schemas, types, constants
|   `-- editor/                     # Tiptap extensions, CodeMirror configs
|-- docker/                         # Dockerfiles and compose files
|-- turbo.json
`-- pnpm-workspace.yaml
```

## Key rules derived from this structure

- `src/server/` MUST NOT be imported by Client Components, `src/client/`, or
  browser-only packages.
- Server Components, route handlers, and server actions MAY import `src/server/`
  through designated server entry modules.
- Files under `app/` are route shells. Business logic lives in `src/server/`.
- Mantine MUST only be imported inside `src/components/ui/`. All other
  components use the `ui/` wrappers. This isolates the component library from
  the rest of the codebase.
- `packages/shared/` has zero runtime dependencies. It contains only types, Zod
  schemas, constants, and pure utility functions.
