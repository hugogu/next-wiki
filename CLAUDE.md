# next-wiki Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-19

## Active Technologies

- TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor). (003-content-storage-backends)

## Project Structure

pnpm workspaces + Turborepo monorepo:

```text
apps/web/                # Next.js 16 app (App Router)
  app/                   # routes (RSC) + REST route handlers under app/api/
  src/server/            # server-only: db (Drizzle schema/migrations), services,
                         #   permissions (can() chokepoint), pipeline, api, crypto
  src/components/         # UI; primitives isolated in src/components/ui/
  src/i18n/               # custom i18n (locales/en.ts canonical + zh.ts)
packages/shared/          # zero-dep shared Zod schemas/types (@next-wiki/shared)
packages/editor/          # editor package
specs/                    # Spec Kit feature specs/plans/tasks
```

## Commands

pnpm install; pnpm dev | build | lint | typecheck | test (Turborepo).
Per-app: `pnpm --filter @next-wiki/web test` (Vitest), `... test:e2e` (Playwright).
DB: `pnpm db:generate` / `pnpm db:migrate` (Drizzle). Full verify:
`docker compose up -d --build`.

## Code Style

TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor). Follow existing
conventions; see `.specify/memory/constitution.md` for binding principles.

## Recent Changes

- 003-content-storage-backends: Added TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
