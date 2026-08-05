# Quickstart Validation: Configurable Space Publication

## Prerequisites

- Run the application and database using the repository Docker Compose workflow.
- Sign in as an Administrator in LLM Wiki mode.
- Prepare one published generated page, one published raw entry, one published
  Wiki page, and at least one restricted page. For migration validation, prepare
  one active link page targeting the generated page.

## 1. Validate space configuration

1. Open the new Admin Space settings page.
2. Verify Wiki, generated, and raw are shown together with display name, route
   prefix, and default page visibility.
3. Set concise non-conflicting prefixes, such as `w`, `g`, and `r`.
4. Confirm rejected validation for a duplicate, a built-in route name, and a
   prefix that conflicts with existing content.
5. Change the generated prefix once more and verify old generated public URLs
   redirect only to the latest public canonical URL.

Expected result: one configured canonical root per space; no ambiguity and no
parallel reader documents.

## 2. Validate page publication and privacy

1. Keep a generated page restricted, then open its canonical public URL in an
   anonymous browser.
2. Mark that published page public and reload the URL anonymously.
3. Create a new draft for the same page; confirm anonymous reading still shows
   the prior published version only.
4. Set the page restricted again, unpublish it, and delete it in separate
   checks.
5. Repeat public visibility on a raw page, then try downloading its original
   raw asset anonymously.

Expected result: only public published body/safe metadata are readable; drafts,
restricted pages, provenance, audit data, and raw source bytes remain protected.

## 3. Validate peer navigation and discovery

1. As Admin, navigate among all configured spaces through the workspace UI.
2. Confirm a public page redirects from workspace reading to its canonical public
   URL; restricted pages remain in the protected workspace reader.
3. Search, list, open citations, browse breadcrumbs, use browser back/forward,
   and open a result in a new tab for each space.
4. Repeat anonymous search/read checks and API/MCP read/list/search checks with
   only the appropriate authorization.

Expected result: every visible result identifies the actual space and uses its
configured canonical URL; no unreadable page or metadata leaks.

## 4. Validate link retirement

1. Run the Admin link-retirement operation on the prepared legacy link page.
2. Review its completion report as Admin.
3. Confirm the link page is absent from page management, navigation, normal
   reader/history/export, search, public API, and MCP results.
4. Request the former link address anonymously while its target is public.
5. Restrict or unpublish the target and request the former link address again.
6. Attempt to create or retarget a link through UI, REST, and MCP inputs.

Expected result: the former URL redirects only while the target remains public;
otherwise it is opaque not-found. New link requests are rejected, and existing
link revision/audit data remains available only to authorized historical views.

## 5. Run automated verification

Run focused service/route/component tests for public routing, Space settings,
permissions, cache invalidation, retirement, search, assets, API, and MCP.
Then run:

```text
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web i18n:validate
pnpm --filter @next-wiki/web openapi:generate
pnpm db:generate
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web exec playwright test
```

Expected result: all checks pass; the final `pnpm db:generate` reports no
schema changes; generated OpenAPI has no active link-page fields.

## 6. Regression checks

- Publish a static site after making a generated/raw page public: feature 031's
  intentionally Wiki-only static artifact still excludes those pages.
- Switch writing mode after retirement: verify the transition does not revive,
  materialize, or dereference retired link pages.
- Rename a public page, move it, and change a space prefix: confirm old/new
  canonical paths and legacy redirect behavior have no stale cached content.
