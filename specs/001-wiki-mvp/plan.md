# Implementation Plan: Wiki MVP Foundation

**Branch**: `001-wiki-mvp` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-wiki-mvp/spec.md`

## Summary

Build the first production-capable release of `next-wiki` as a Docker-first,
permission-aware, revisioned wiki platform with a stable MVP database
foundation. This implementation wave includes first-run setup, local and
enterprise authentication options, page authoring and version history,
hierarchical paths, redirects, internal link tracking, multilingual pages, tag
discovery, PostgreSQL full-text search, a token-based style system, and
optional AI provider-backed chat with citations. The design preserves one
application codebase, one primary stateful dependency, and explicit API layers
for the web app, public integrations, and AI tooling.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+  
**Primary Dependencies**: Next.js 16 App Router, React 19.2, Better Auth,
Drizzle ORM, pg-boss, Mantine, Tailwind CSS, TanStack Query, Zustand, React
Hook Form, Tiptap, unified/remark/rehype, DOMPurify-compatible sanitization,
PostgreSQL full-text search, optional pgvector when AI retrieval is enabled  
**Storage**: PostgreSQL 16+ for application data and search metadata, local
filesystem for default assets and stored diagram artifacts, optional pgvector
extension for AI embedding retrieval  
**Testing**: Vitest, Playwright, migration smoke tests, route contract tests,
permission matrix tests, rendering pipeline snapshot tests  
**Target Platform**: Linux containers launched via Docker Compose for default
install, with optional Kubernetes deployment later  
**Project Type**: Monorepo web application  
**Performance Goals**: Non-AI page read and search responses under 1 second p95
for ordinary pages; first-run setup under 15 minutes; redirect resolution and
internal link validation transparent to readers; AI answers begin within 5
seconds when provider and index are healthy  
**Constraints**: Single `docker compose up` baseline, PostgreSQL as the only
required stateful service, all MVP persistent domains initialized in the first
schema release, all API surfaces share one service layer, no synchronous LLM
work in request handlers, permission checks on every data-returning path  
**Scale/Scope**: Self-hosted personal and team wiki deployments, initial target
of 10,000 pages, dozens of spaces, 100 concurrent active users, multiple
locales, and multiple configured AI providers with one or more enabled

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **P1 Simple Deployment is a Feature**: PASS. PostgreSQL remains the only
  required stateful service. App and worker share one application image.
- **P2 AI as Optional Enhancement, Chat as First-Class UI**: PASS. AI providers
  are optional, AI chat is permission-scoped and citation-backed, and all core
  wiki workflows remain usable without AI.
- **P3 Rendering Pipeline is Sacred**: PASS. Markdown, Mermaid, LaTeX, draw.io,
  internal link validation, and sanitization are all implemented as explicit
  rendering pipeline stages or plugins.
- **P4 Permissions are First-Class**: PASS. Permission precedence, inheritance,
  translation independence, page moves, search filtering, redirect handling, AI
  retrieval, and API access all run through the same permission model.
- **P5 Style System Independence**: PASS. Theme records map structured tokens to
  CSS custom properties rather than embedding design values in feature code.
- **P6 Async-First for Heavy Operations**: PASS. AI indexing, AI responses,
  imports, search rebuilds, and restore-like operations are modeled as
  background tasks with job status.
- **P7 Version Everything**: PASS. Every page save yields an immutable revision.
  Soft deletion and revision-based AI grounding remain intact.
- **P8 Open Standards Over Proprietary**: PASS. Internal tRPC, public REST +
  OpenAPI, scoped API tokens, and optional MCP contracts remain the three-layer
  interface model.
- **P9 Explicit Over Implicit**: PASS. Auth providers, render plugins, jobs, AI
  providers, and tool surfaces are explicitly registered.
- **P10 Operator Experience is Product Surface**: PASS. First-run setup,
  restart-safe persistence, health/readiness, and Docker-first quickstart remain
  in scope.
- **P11 Focused Scope Over Feature Accumulation**: PASS. MVP includes the core
  wiki foundation but explicitly excludes real-time collaboration, alternative
  editors as primaries, and Git-backed storage.

**Post-Design Recheck**: PASS. The design artifacts remain inside the
constitution boundaries and do not introduce new mandatory infrastructure or
scope expansion outside the spec.

## Project Structure

### Documentation (this feature)

```text
specs/001-wiki-mvp/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- public-api.yaml
|   `-- mcp-tools.md
`-- tasks.md
```

### Source Code (repository root)

```text
apps/
`-- web/
    |-- app/
    |   |-- (public)/
    |   |-- (auth)/
    |   |-- (admin)/
    |   |-- (editor)/
    |   `-- api/
    |       |-- trpc/[trpc]/
    |       |-- v1/
    |       `-- mcp/
    `-- src/
        |-- server/
        |   |-- trpc/
        |   |-- rest/
        |   |-- mcp/
        |   |-- services/
        |   |-- db/
        |   |-- auth/
        |   |-- pipeline/
        |   |-- ai/
        |   `-- jobs/
        |-- client/
        |-- components/
        |   |-- ui/
        |   |-- admin/
        |   |-- editor/
        |   `-- common/
        `-- hooks/
packages/
|-- shared/
`-- editor/
docker/
```

**Structure Decision**: Use the constitution-defined monorepo web application
layout so the page experience, auth flows, admin surfaces, typed internal API,
public REST API, MCP tools, and background jobs all share one service layer and
one database model.

## Complexity Tracking

No constitution violations or justified complexity exceptions are required for
this plan.
