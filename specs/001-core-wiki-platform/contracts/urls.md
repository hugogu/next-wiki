# URL & Navigation Contract

**Feature**: `001-core-wiki-platform`
**Mandate**: Constitution P12 + `docs/architecture/mandates.md` § Frontend
Routing & URL Contract.

The product is **not an SPA**. Every user-reachable state has a real URL; the
browser's back/forward/refresh/deep-link/open-in-new-tab must work everywhere;
GET never mutates; 404/403 are real, history-linear routes.

Pages are addressed by a user-defined `path` that may contain `/`-separated
segments (e.g. `docs/intro/getting-started`). The catch-all route `[...path]`
must be defined after all other literal page routes so that prefixes such as
`/edit`, `/history`, `/revisions`, and `/properties` are matched first.

## URL schemes (this slice)

| Surface | URL | Method | Mutates? | Access |
|---|---|---|---|---|
| Wiki home (published page list + navigator tree) | `/` | GET | no | public\* / any signed-in |
| Read a page (live published version) | `/{path}` | GET | no | public\* / any signed-in |
| Page properties (change path) | `/properties/{path}` | GET (form) + PATCH | PATCH yes | author / editor / admin |
| Page history | `/history/{path}` | GET | no | signed-in (readers see published versions; author/editor/admin see all) |
| View a specific revision | `/revisions/{n}/{path}` | GET | no | author / editor / admin (draft revisions: author + admin only) |
| Edit / create new draft | `/edit/{path}` | GET (form) + POST (save) | POST yes | editor / admin |
| Create page (new path) | `/new` | GET (form) + POST | POST yes | editor / admin |
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
  use POST (forms / REST endpoints) against resource-oriented
  routes; reads are idempotent GET.
- **Canonical entry points.** Each page has exactly one URL: `/{path}`. The path
  may contain `/`-separated segments. Path changes are permitted via the Page
  Properties screen; redirects from old paths are deferred for this slice, so
  bookmarks to an old path will 404 until a redirect feature is added.
- **Catch-all ordering.** Because Next.js catch-all `[...path]` is greedy, the
  literal route prefixes (`/edit`, `/history`, `/revisions`, `/properties`)
  must be declared before the page catch-all. The concrete route structure is:
  - View: `/[...path]`
  - Edit: `/edit/[...path]`
  - History: `/history/[...path]`
  - Revision: `/revisions/[n]/[...path]`
  - Properties: `/properties/[...path]`
- **Breadcrumbs**, derived server-side from the route + page tree:
  - `/` → *(none, root)*
  - `/{path}` → `Home / {title}`
  - `/properties/{path}` → `Home / {title} / Properties`
  - `/edit/{path}` → `Home / {title} / Edit`
  - `/history/{path}` → `Home / {title} / History`
  - `/revisions/{n}/{path}` → `Home / {title} / History / Revision {n}`
  - `/admin/users` → `Admin / Users`
- **Navigator tree.** The wiki home renders a directory tree built from the `/`
  segments of published page paths, linking to each page's canonical `/{path}`
  URL.
- **Drafts do not leak.** `/{path}` for a page with no published version returns
  404-style not-found for non-author/non-admin callers (no metadata leak).
  Revision URLs for drafts return not-found for everyone except author/admin.
- **Browser-native behavior.** Back/forward/refresh land on equivalent state;
  client-side navigations push history; 404/403 are navigable so history stays
  linear. Verified by Playwright (research D11).
