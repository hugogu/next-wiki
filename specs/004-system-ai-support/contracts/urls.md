# URL Contract: System-Level AI Support

**Feature**: 004-system-ai-support

## Canonical administration routes

| Resource | Canonical URL |
|---|---|
| AI overview/settings | `/admin/ai` |
| Provider collection | `/admin/ai/providers` |
| Provider detail | `/admin/ai/providers/{providerId}` |
| Model catalog | `/admin/ai/models` |
| Knowledge indexes | `/admin/ai/indexes` |
| Index generation detail | `/admin/ai/indexes/{generationId}` |
| AI operational audit | `/admin/ai/actions` |
| User AI entitlement | `/admin/users/{userId}/ai` |

Provider/model/index filters, pagination, and sort are URL search parameters.

Examples:

```text
/admin/ai/models?provider={id}&capability=embedding&availability=available
/admin/ai/indexes/{id}?status=failed&page=2
/admin/ai/actions?feature=wiki_question&status=failed
```

## Semantic search

```text
/search?q={query}&mode=semantic&page={n}
```

`q`, `mode`, and pagination are shareable URL state. The transient action id is
not canonical search state and may remain client/server state.

## AI chat side pane

The pane is available within the existing reader, editor, and admin canonical
routes.

```text
?ai=open&aiMode=retrieval
?ai=open&aiMode=full
```

Rules:

- closed pane omits `ai` or uses `ai=closed`;
- opening/closing pushes or replaces browser history consistently;
- mode is preserved on refresh/back/forward;
- current page identity comes from the canonical route, not a duplicated query
  parameter;
- when AI is globally disabled or unavailable to the current user, invalid AI
  parameters are removed or ignored without showing protected configuration.

## Editor dialogs

Text optimization and image generation are transient task dialogs. Their draft
input and preview state are not independently bookmarkable and therefore do not
require routes. The underlying action and generated artifact are REST resources.

If product behavior later makes an action history/preview user-navigable, it
must gain a canonical user route before release.

## Breadcrumbs

- `/admin/ai/providers/{id}` → Admin / AI / Providers / Provider name
- `/admin/ai/indexes/{id}` → Admin / AI / Knowledge indexes / Generation
- `/admin/users/{id}/ai` → Admin / Users / User display name / AI access
- `/search` → Search

Breadcrumb resolution must not expose provider names, user identities, pages,
or index metadata to unauthorized callers.

## Forbidden duplicate entry points

- No `/admin/settings/ai` alias.
- No `/ai/settings` user route.
- No separate full-page Wiki Q&A route in this slice; the side pane is the
  canonical Q&A surface.
- No action-style URLs such as `/admin/ai/testProvider` or `/ai/generateImage`.
  Mutations use REST methods and sub-resources.
