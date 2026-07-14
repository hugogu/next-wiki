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
|       |       |-- pages/ auth/ users/ ...  # Internal REST route handlers
|       |       |-- v1/             # Public REST route handlers (added when public contract frozen)
|       |       `-- mcp/            # Optional MCP transport handlers
|       `-- src/
|           |-- server/             # Server-only code
|           |   |-- api/            # REST route helpers + OpenAPI metadata (session, errors, validate)
|           |   |-- mcp/            # MCP tool adapters (optional)
|           |   |-- services/       # Business logic layer
|           |   |   `-- search/     # Registered search capabilities, coordinator, and rank fusion
|           |   |-- db/             # Drizzle schema + migrations
|           |   |-- auth/           # Custom bcrypt session auth + first-run admin bootstrap
|           |   |-- pipeline/       # Rendering pipeline (remark/rehype)
|           |   |-- ai/             # Optional AI provider and retrieval layer
|           |   `-- jobs/           # pg-boss job definitions
|           |-- client/             # Client-only code
|           |-- components/
|           |   |-- ui/             # Unified design system: in-house primitives, tokens, shared visual assets
|           |   |-- admin/          # Admin dashboard components
|           |   |-- editor/         # Editor components (CodeMirror 6)
|           |   |-- chat/           # AI chat side pane components
|           |   `-- common/         # Shared components (navigation, breadcrumbs, layout)
|           `-- hooks/              # Custom React hooks
|-- packages/
|   |-- shared/                     # Zod schemas, types, constants
|   `-- editor/                     # CodeMirror extensions and editor configs (optional shared package)
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
- Search retrieval implementations live in `src/server/services/search/`.
  Route handlers and UI components use the shared public-content/search facade;
  they MUST NOT import a capability adapter or database query directly.
- Third-party UI/control libraries (if any are introduced later) MUST only be
  imported inside `src/components/ui/`. All other components use the `ui/`
  primitives. The current implementation uses no third-party UI control library.
