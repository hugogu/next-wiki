# Quickstart: Validate AI Page Translation

## Prerequisites

- Start standard web, worker, and PostgreSQL deployment.
- Sign in as administrator and configure an available text-generation provider/model.
- Publish at least three source pages, including nested paths, frontmatter, a code block, an internal link, and an image.

```bash
docker compose up -d --build
docker compose ps
curl -sf http://127.0.0.1:3000/readyz
pnpm typecheck
pnpm lint
pnpm --filter @next-wiki/web openapi:generate
git diff --check
```

## Original and translated URL scenario

1. Create a translation style and enable `zh` target language.
2. Start a `missing` run for all published pages using a known model.
3. Open run detail in a new tab and refresh during processing.
4. After completion, open `/docs/getting-started` and `/zh/docs/getting-started`.

Expected: unprefixed address always shows original; prefixed address shows only current translation; canonical/alternate links are correct; unknown language is not an original page; code, structure, assets, and valid links render safely.

## Pause, resume, and replacement scenario

1. Start a run with at least 20 source pages.
2. Wait for several items, then pause and refresh its admin detail URL.
3. Resume and confirm current successful pages are skipped.
4. Start a retry/replacement with a different model or prompt version.
5. Inspect a translated page's version/provenance history.

Expected: each attempt has one terminal result; pause/cancel preserves published output; resume uses frozen inputs; replacement creates successor run and new translated revision; superseded revision retains source/model/prompt provenance.

## Automatic freshness scenario

1. Complete a page translation and record its source revision.
2. Publish two newer source revisions quickly.
3. Observe translation state/runs until refresh completes.
4. Open language-prefixed page and inspect current provenance.

Expected: only newest source becomes current translation basis; no obsolete output becomes current; new translation is a separate immutable revision; later reads show current rendered output rather than stale cache.

## Failure, authorization, and analytics scenario

1. Pause/cancel during work, restart worker, and verify recovery/retry completes unfinished items safely.
2. Disable provider/model and attempt a new run.
3. Open source/translation/run URLs as reader and unauthenticated users under current space policy.
4. Inspect completed, failed, skipped, and missing-provider-usage records.

Expected: unauthorized callers learn no hidden source/translation existence; disabled AI/model fails new work clearly without losing history; errors contain no prompt, Markdown, credential, or raw provider body; analytics distinguish reported, estimated, and unavailable tokens and record duration/model/prompt/source-version provenance.

## Automated verification

```bash
pnpm test
pnpm --filter @next-wiki/web test:e2e
```

Focused suites cover schema/migration constraints, source-vs-language route resolution, cache invalidation, prompt snapshots, usage normalization, valid/invalid Markdown, claim/retry/pause/cancel and boot recovery, stale-source suppression, revision history, API authorization/OpenAPI, and reader/admin Playwright flows.
