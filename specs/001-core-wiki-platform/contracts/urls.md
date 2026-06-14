# URL & Navigation Contract

**Feature**: `001-core-wiki-platform`
**Mandate**: Constitution P12 + `docs/architecture/mandates.md` § Frontend
Routing & URL Contract.

The product is **not an SPA**. Every user-reachable state has a real URL; the
browser's back/forward/refresh/deep-link/open-in-new-tab must work everywhere;
GET never mutates; 404/403 are real, history-linear routes.

## URL schemes (this slice)

| Surface | URL | Method | Mutates? | Access |
|---|---|---|---|---|
| Wiki home (published page list) | `/` | GET | no | public\* / any signed-in |
| Read a page (live published version) | `/{slug}` | GET | no | public\* / any signed-in |
| Page history | `/{slug}/history` | GET | no | author / editor / admin |
| View a specific revision | `/{slug}/revisions/{n}` | GET | no | author / editor / admin (draft revisions: author + admin only) |
| Edit / create new draft | `/{slug}/edit` | GET (form) + POST (save) | POST yes | editor / admin |
| Create page (new slug) | `/new` | GET (form) + POST | POST yes | editor / admin |
| Login | `/auth/login` | GET + POST | POST yes | public |
| Register | `/auth/register` | GET + POST | POST yes | public |
| First-run admin setup | `/setup` | GET + POST | POST yes | only when zero admins exist |
| Admin: user management | `/admin/users` | GET | no | admin |
| Admin: user action (role/reset) | `/admin/users/{id}` | POST | yes | admin |
| Sign out | `/auth/logout` | POST | yes | signed-in |
| Not found | `/not-found` (and any unmatched → 404) | GET | no | all |
| Forbidden | `/forbidden` | GET | no | all |

\* Public read applies only when `spaces.anonymous_read = true` (default). When
false, anonymous visitors are redirected to `/auth/login`.

## Rules

- **Resources, not verbs.** No `/createPage`, `/doSave`, `/deleteUser`. Mutations
  use POST (forms / server actions / tRPC mutations) against resource-oriented
  routes; reads are idempotent GET.
- **Canonical entry points.** Each page has exactly one URL: `/{slug}`. The slug
  is immutable (A12), so no trailing-slash/case duplicate handling is needed
  beyond Next.js defaults; any future rename will add a 308 redirect.
- **Breadcrumbs**, derived server-side from the route + page tree:
  - `/` → *(none, root)*
  - `/{slug}` → `Home / {title}`
  - `/{slug}/edit` → `Home / {title} / Edit`
  - `/{slug}/history` → `Home / {title} / History`
  - `/{slug}/revisions/{n}` → `Home / {title} / History / Revision {n}`
  - `/admin/users` → `Admin / Users`
- **Drafts do not leak.** `/{slug}` for a page with no published version returns
  404-style not-found for non-author/non-admin callers (no metadata leak).
  Revision URLs for drafts return not-found for everyone except author/admin.
- **Browser-native behavior.** Back/forward/refresh land on equivalent state;
  client-side navigations push history; 404/403 are navigable so history stays
  linear. Verified by Playwright (research D11).
