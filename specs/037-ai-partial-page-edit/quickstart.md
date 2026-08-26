# Quickstart: Validate AI Anchored Partial Page Edits

This guide validates the implemented feature in a local development
deployment. No database schema changes ship with this feature, so no
migration step is required.

## Prerequisites

- Node.js and pnpm versions supported by the repository.
- Docker Desktop/Engine for PostgreSQL and the normal app/worker image.
- An Admin account with an AI provider configured (any OpenAI-compatible
  provider is sufficient; no web-research connector is needed for this
  feature).
- One existing Wiki page large enough that its full body would risk
  incomplete reproduction in one model turn (roughly 15,000+ characters is a
  good stress case — reproduce the originally reported scenario).

## Build and verify

From the repository root:

~~~bash
pnpm install
docker compose up -d --build
pnpm lint
pnpm typecheck
pnpm test
~~~

`pnpm db:generate` should report no schema changes for this feature; run it
only if you also touched `schema/*.ts` for an unrelated reason.

## Manual verification: anchored edit preserves the rest of the page

1. Open the large test page in the reader and note its exact current content
   (copy it aside for comparison).
2. Open the AI chat side pane and ask Wiki AI to add or refresh one specific,
   identifiable part of the page (for example, "add a short section at the
   end noting today's date" or "update the number in the second paragraph to
   X").
3. Confirm Wiki AI's tool-call transcript shows `insert_page_content`, not
   `save_draft`, for this request.
4. Open the resulting draft's diff against the prior revision (Version
   History → compare). Expect: only the requested passage changed; every
   other line is unchanged. Confirm by diffing the draft against the content
   you copied aside in step 1 — the only difference should be the requested
   addition/change.
5. Approve the draft through the normal review flow and confirm publishing
   behaves exactly as it does for a `save_draft`-produced draft today.

## Manual verification: multi-anchor edit is atomic

1. Ask Wiki AI to make two unrelated small changes to the same page in one
   request (for example, "update the intro paragraph and also add a new
   closing sentence at the end").
2. Confirm exactly one new draft revision is created containing both changes.
3. Repeat with a request that references a passage that does not exist
   verbatim on the page (for example, ask it to edit a paraphrased version of
   a sentence rather than the exact text). Confirm no draft is created and
   the assistant's answer explains it could not find that exact passage.

## Manual verification: content-loss guard on save_draft

1. Ask Wiki AI to update a small part of a large page in a way that risks the
   model regenerating (and shrinking) the whole body rather than using
   `insert_page_content` — or, to trigger the guard deterministically for this
   test, temporarily disable `insert_page_content` in Admin → AI Tools first,
   then ask for the same large-page update so the model falls back to
   `save_draft`.
2. If the resulting `contentSource` comes back dramatically shorter than the
   page's current revision, confirm the `save_draft` call is rejected — no new
   draft revision is created — and the assistant's answer explains the
   apparent content loss instead of claiming success.
3. Ask Wiki AI to genuinely delete most of the page's content (a request that
   legitimately calls for a large reduction, e.g. "remove everything except
   the introduction"). Confirm the resulting `save_draft` call succeeds (the
   model should set `acknowledgedContentReduction: true` because the user
   explicitly asked for the deletion) and a new draft is created.
4. As a control, ask for a small, genuine edit via `save_draft` (comparable or
   larger resulting length) and confirm it succeeds normally, unaffected by
   the guard.

## Admin toggle check

1. In Admin → AI Tools, disable `insert_page_content` independently of
   `save_draft`.
2. Repeat the first manual scenario. Confirm Wiki AI falls back to using
   `save_draft` (or explains the limitation), exactly as it does today when
   any other content tool is disabled — no new fallback code path.
3. Re-enable the tool and confirm behavior returns to normal.

## Automated coverage

~~~bash
pnpm --filter @next-wiki/web test -- ai-page-content-patch
pnpm --filter @next-wiki/web test -- ai-tool-executors
pnpm --filter @next-wiki/web test -- wiki-question-tool-planner
~~~

All three suites must pass, including the new anchor-matching, executor
governance, and prompt-guidance cases described in
`contracts/wiki-ai-tools.md`.
