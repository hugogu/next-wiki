# Web localization

The web UI uses `next-intl` with an explicit two-value registry (`en` and
`zh`). UI language is a preference, not a route segment: do not add locale
middleware, `defineRouting`, URL rewrites, or locale-aware navigation helpers.

Message catalogs live in [`messages/en.json`](./messages/en.json) and
[`messages/zh.json`](./messages/zh.json). They are namespaced JSON catalogs;
`pnpm --filter @next-wiki/web i18n:validate` checks key parity and ICU
variable compatibility before release.

There are two rendering boundaries:

- Dynamic application screens resolve persisted preference, the
  `next-wiki-locale` cookie, weighted `Accept-Language`, then English.
- Public reader documents use a request-independent English server default.
  Personal controls hydrate on the client, so cookies and preferences never
  vary public document HTML, canonical URLs, hreflang, or cache tags.

The existing `/{language}/{path}` convention remains content translation
routing. `zh` in that URL identifies translated page content; it never selects
the UI language.

# First-run onboarding

`/setup` is the single canonical first-run entry point. It walks the operator
through four server-driven steps: creating the initial Admin account, optional
OpenRouter AI bootstrap, optional example/help pages, and a final summary.
Step state lives in the singleton `setup_progress` table, so refreshing or
reopening `/setup` resumes at the next incomplete step without repeating side
effects. Once onboarding is complete (or the Admin predates onboarding),
`/setup` redirects to `/`.

Setup APIs are never cached and never return credentials:

- `GET /api/setup` — current onboarding state. Anonymous callers only learn
  whether account setup is needed; the signed-in Admin gets the full
  resumable state and credential-free summary. Reading state also reconciles
  any in-flight AI bootstrap against its background model-sync actions.
- `POST /api/auth/setup` — creates exactly one initial Admin (advisory-lock
  serialized), establishes the session, and advances onboarding to the AI
  step. Returns `403` once an Admin exists.
- `PUT /api/setup/ai-bootstrap` — `skip` records the choice with zero outbound
  AI calls; `configure` validates the OpenRouter key inline, stores it
  encrypted as the model-detector key, registers/reuses one provider per
  capability, and queues model sync through the normal AI action pipeline.
  Detected models are auto-assigned to `wiki_text`, `wiki_embedding`, and
  `wiki_image` when capability evidence exists; anything else is reported as
  needing manual setup.
- `PUT /api/setup/sample-pages` — `generate` creates or enriches `welcome`,
  `help/markdown-syntax`, and `help/main-features` as normal published wiki
  pages (idempotent, collision-safe, cache-invalidating); `skip` records the
  choice.

The OpenRouter base URL defaults to `https://openrouter.ai/api/v1` and can be
overridden with `OPENROUTER_BASE_URL` for proxies, mirrors, or test fixtures.
