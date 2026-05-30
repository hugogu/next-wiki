# next-wiki Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-30

## Active Technologies
- PostgreSQL 16+ for application data and search metadata, local (001-wiki-mvp)

- TypeScript 5.x on Node.js 20.9+ + Next.js 16 App Router, React 19.2, Better Auth (001-wiki-mvp)

## Project Structure

```text
apps/
`-- web/
    |-- app/
    |-- src/
    `-- tests/
packages/
|-- shared/
`-- editor/
docker/
specs/
```

## Commands

pnpm lint
pnpm test
pnpm --filter web dev
docker compose up --build

## Code Style

TypeScript 5.x on Node.js 20.9+: Follow standard conventions

## Recent Changes
- 001-wiki-mvp: Added the monorepo web wiki stack and planning baseline for
  Next.js 16, Better Auth, PostgreSQL, and Docker-first deployment

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
