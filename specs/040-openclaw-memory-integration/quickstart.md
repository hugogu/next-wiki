# Quickstart: OpenClaw Agent Memory Bridge

## Prerequisites

- A Next Wiki checkout with the 039 Agent Memory feature and PostgreSQL
  started through the repository `docker-compose.yml`. No schema change is
  needed for this feature.
- An owner/admin session to create a memory-provider API key.
- An OpenClaw Gateway test installation, and optionally an existing Hermes
  configuration to verify coexistence.

## Provision Hermes and OpenClaw

1. As an owner, open **User Center → API Keys** and create a **Memory
   provider** key for each adapter (this UI/flow already existed for
   Hermes; nothing changed here for this feature). Give each a stable
   **agent identity**.
2. By default each key gets its own private destination and recall stays
   isolated per `(destination, agent identity)`. If you want the two to
   actually share memory, choose **use shared destination** when creating
   the second key *and* give it the same agent identity as the first —
   sharing the destination alone only groups the keys for administration,
   it does not unify recall by itself.
3. Confirm `GET /api/v1/memory/connection` with each credential reports only
   its own destination.
4. Save one record through each adapter and recall from the other (default
   scope). Unless you deliberately shared both destination and agent
   identity, neither result set contains the other key's record.

Bridge configuration:

```json
{
  "wikiApiBaseUrl": "https://wiki.example.com/api/v1",
  "credential": "${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}",
  "capture": { "enabled": false, "modes": ["session_end"] },
  "tools": { "enabled": false },
  "promptEnrichment": { "enabled": false }
}
```

The credential is a secret reference, never a literal in a committed plugin
configuration.

**Result (2026-08-29)**: Verified via the 039 `apiKeyService.create()` code
path (`memoryProvider.sharedNamespaceId`) and its existing test coverage in
`apps/web/src/server/services/api-keys.test.ts` — no changes were needed for
this feature.

## Verify OpenClaw coexistence and capture recovery

Install the built bridge package, enable it, and explicitly allow any
requested conversation/prompt/tool permissions. Do not configure it as the
OpenClaw memory-slot owner: a local provider must remain functional.

Enable checkpoint or session-end capture, stop the Wiki endpoint temporarily,
then trigger the selected event. The hook must return after recording a
local outbox entry. Restart the Gateway and endpoint; the service worker
recovers the entry and the server status becomes `durable` only after
returning a Raw page and immutable revision citation. Confirm diagnostics
reveal no body/query/title or secret.

**Result (2026-08-29)**: Verified in
`packages/openclaw-memory-bridge/tests/capture-lifecycle.test.ts` (duplicate
capture produces at most one durable record; `stop()` resolves within its
drain budget even if a delivery never settles) and `tests/config.test.ts` /
`tests/tools-and-prompt.test.ts` (no raw payload or credential ever appears
in a diagnostic/status/error string).

## Guide page

Confirm `generateSamplePages`/`reinitializeSamplePages` creates or refreshes
five managed pages: `welcome`, `help/markdown-syntax`, `help/main-features`,
`integrations/hermes`, `integrations/openclaw` — using the same marker-owned,
collision-safe mechanism for all five, no new cache-tag logic.

**Result (2026-08-29)**: Verified in
`apps/web/src/server/services/setup-sample-pages.test.ts` (22 tests).

## Release verification

```bash
pnpm --filter @next-wiki/openclaw-memory-bridge test
pnpm --filter @next-wiki/openclaw-memory-bridge typecheck
pnpm --filter @next-wiki/openclaw-memory-bridge build
node packages/openclaw-memory-bridge/scripts/validate-manifest.mjs
```

Then pack and clean-install the built package into a scratch project
alongside the real `openclaw` peer dependency and run
`scripts/inspect-runtime.mjs` against it, exactly as the publish workflow
does — this is the step that catches ESM packaging defects (missing `.js`
extensions on relative imports) that only surface outside the monorepo's own
`node_modules`.

**Result (2026-08-29)**: Verified via a real `npm pack` → clean install
(with the real `openclaw` peer dependency) → dynamic `import()` of the built
entry point, both before and after fixing a genuine ESM packaging bug found
this way in an earlier iteration of the bridge.

## Final integration check

```bash
docker compose up -d --build
```

Run the focused bridge suite, the touched web-app guide-page tests, and the
end-to-end coexistence scenario. Confirm `apps/web`'s dependency graph
carries no runtime dependency on `packages/openclaw-memory-bridge` (it is a
standalone package the web app never imports).

**Result (2026-08-29)**: Ran the focused bridge suite (47 tests),
`agent-memory-openclaw-hermes.spec.ts` (real Playwright run against a
dedicated Postgres + built server), and confirmed
`apps/web/package.json`'s merged dependencies contain no entry matching
`openclaw`. `docker compose up -d --build` was not run this pass (a separate
compose stack for the main checkout was already occupying the default
ports on this machine); run it before an actual release.

The e2e run caught a real documentation gap: sharing a destination at
key-creation time only groups keys into the same destination row for
administration — recall still stays isolated per `(destination, agent
identity)`. An earlier draft of the guides/README implied sharing a
destination alone was enough to unify recall across two keys; both keys
also need the *same* agent identity. Corrected in the Hermes guide, the
OpenClaw guide, the bridge README, and this file.
