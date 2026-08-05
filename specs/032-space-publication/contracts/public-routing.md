# Browser and Canonical Routing Contract

## Canonical public reader

Every publicly readable page has exactly one reader URL:

```text
/{space-route-prefix}/{page-path}
```

The `space-route-prefix` is administrator-configured. `page-path` is the
existing language-neutral page path. Locale addressing continues to use the
project's established locale convention inside the public route, with the
resolved space prefix remaining part of the canonical URL.

The anonymous public route returns a static/ISR document only when the
resolved page:

1. belongs to an enabled space;
2. is not deleted;
3. has a current published revision; and
4. has `visibility=public`.

Missing, deleted, draft, disabled-space, and opaque legacy failures return
not-found without page title, target, provenance, raw asset, draft, or audit
disclosure.

Published protected pages intentionally differ from missing pages:

| Visibility | Anonymous request | Authenticated request |
|---|---|---|
| `public` | static/ISR document | static/ISR document |
| `registered` | generic access-denied page with register/sign-in actions | dynamic reader at the same canonical URL |
| `restricted` | generic access-denied page | generic access-denied page unless the actor is an Administrator |

The access-denied response never identifies the protected page. Authenticated
external-reader requests are internally rewritten to the dynamic registered
reader so registered content cannot enter the anonymous ISR cache.

## Protected workspace reader

The existing dynamic workspace reader remains the route for restricted pages
and editing/review context. It resolves the user-visible configured prefix,
checks the authenticated actor, and redirects a public target to that target's
canonical public URL. It never changes the public document body based on a
session.

## Legacy routes

| Route class | Behavior |
|---|---|
| Previous space prefix | Resolve alias, then 308 redirect to the current canonical route only after current public eligibility succeeds. |
| Previous bare Wiki route | Resolve as a migration-era legacy input; native content wins. A public result redirects to the configured Wiki route. |
| Generated/raw route before LLM Wiki-to-Copilot migration | Resolve its recorded page-route redirect to `/wiki-prefix/generated/...` or `/wiki-prefix/raw/...` only while the migrated page is currently public/published. |
| Former link URL | Native content at the path wins. Otherwise look up the retired-link record and redirect only if its target is currently public/published. |
| Retired prefix or link whose target is private, draft, deleted, or missing | Return opaque not-found. |

Legacy input is never emitted by navigation, search, sitemap, API, MCP,
citations, notifications, or page-management controls.

## Prefix validation

- A prefix is one normalized route segment.
- It is non-empty, globally unique across current prefixes and aliases, and
  does not collide with a framework-reserved route or a current/legacy content
  address.
- Updating a prefix is atomic: validate all conflicts, persist the alias and
  new setting, emit audit data, then invalidate old/new public routes and
  navigation data.
- The initial configuration is validated before it replaces legacy canonical
  addresses; an operator must choose a non-conflicting prefix when existing
  content would be ambiguous.

## Public projection

Public documents and metadata may include title, published body, safe page
metadata, canonical link, headings, and approved page-local navigation. They
must not include editor actions, unpublished revisions, raw source-byte
downloads, source metadata, audit history, restricted provenance, link-target
fields, or any unreadable page in a list/search result.
