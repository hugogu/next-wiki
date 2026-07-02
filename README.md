<div align="center">

# next-wiki

**A personal, AI-native knowledge assets vault.**

Write and organize knowledge with AI — and let that same knowledge base become 
the grounding memory any AI assistant reads from when it talks with you. 
Self-hosted, `docker compose up` simple, and never locked to a single AI vendor.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.9%2B-339933?logo=node.js&logoColor=white)](package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](apps/web/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](tsconfig.base.json)

</div>

---

## Screenshots

| Knowledge base home | Public REST API reference |
| --- | --- |
| ![Knowledge base home](docs/screenshots/welcome.png) | ![API documentation](docs/screenshots/api-docs.png) |

| AI Native integration |
| --- |
| ![AI settings](docs/screenshots/ai-settings.png) |

## Why next-wiki

- **AI-native creation, never vendor-locked.** A persistent AI chat side pane
  and an [MCP](https://modelcontextprotocol.io) server are the default way to
  draft pages, restructure the page tree, and refine content through dialogue
  — but the manual editor stays fully capable and the wiki never depends on a
  live model connection to be readable, searchable, and editable.
- **Your portable AI memory.** Any MCP-compatible client (Claude, Cursor, or a
  future assistant) can search, read, and write into the same
  permission-scoped store that backs the web UI, so your knowledge outlives
  any single AI vendor.
- **Personal by default.** One `docker compose up` gives a single owner full
  read/write access with zero configuration — no multi-user setup or
  organization concept required to get started.
- **Simple deployment.** PostgreSQL is the only required stateful service.
  Optional features (multi-user sharing, object storage, MCP) never grow the
  default footprint.
- **Everything is versioned.** Every save creates an immutable revision;
  deletion is soft by default; diffs between any two revisions are always
  available.
- **Open standards.** A REST + OpenAPI public content API, OAuth2/OIDC for
  federated auth, and Markdown + frontmatter export — no proprietary lock-in
  in the critical path.

## Quick start

Prerequisites: [Docker](https://www.docker.com/) and Docker Compose.

```bash
git clone https://github.com/hugogu/next-wiki.git
cd next-wiki
cp .env.example .env   # edit as needed (registry mirrors, ports, encryption key)
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) — the app seeds itself on
first run. PostgreSQL is the only required service; everything else (object
storage, alternate content backends) is opt-in via Compose profiles, e.g.
`docker compose --profile storage-s3 up`.

### Local development

```bash
pnpm install
pnpm dev          # turbo run dev, all workspaces
pnpm build        # turbo run build
pnpm lint          # turbo run lint
pnpm typecheck     # turbo run typecheck
pnpm test          # turbo run test
```

Per-app commands live under `apps/web`, e.g. `pnpm --filter @next-wiki/web test:e2e`
for Playwright end-to-end tests. Database migrations use Drizzle:
`pnpm db:generate` / `pnpm db:migrate`.

## Tech stack

Next.js 16 (App Router) · TypeScript 5 · PostgreSQL + Drizzle ORM · pg-boss for
background jobs · a pluggable Markdown rendering pipeline (remark/rehype,
KaTeX, Mermaid) · MCP server for AI clients.

## Project structure

```text
apps/web/                # Next.js app (App Router)
  app/                    # routes (RSC) + REST route handlers under app/api/
  src/server/             # db (Drizzle), services, permissions, pipeline, api
  src/components/         # UI; design-system primitives in src/components/ui/
  src/i18n/               # en.ts (canonical) + zh.ts
packages/shared/          # zero-dep shared Zod schemas/types
packages/editor/          # editor package
packages/mcp-server/      # @next-wiki/mcp-server — MCP tools for AI clients
specs/                    # Spec Kit feature specs/plans/tasks
docs/                     # architecture docs, plans, reviews
```

## AI integration (MCP)

`@next-wiki/mcp-server` exposes the public wiki content API as MCP tools —
search, read, create, publish, and manage pages from Claude Desktop, Cursor,
or any MCP-compatible client. See
[packages/mcp-server/README.md](packages/mcp-server/README.md) for setup.

## Documentation

- [`docs/architecture`](docs/architecture) — architectural mandates and
  design docs
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) —
  binding project principles
- [`specs/`](specs) — feature specs, plans, and tasks (Spec Kit workflow)

## Contributing

Issues and pull requests are welcome. Please keep changes focused, follow the
existing code conventions, and add tests for new behavior.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
