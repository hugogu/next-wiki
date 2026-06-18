# URL / Navigation Contract: User Center & API Keys

**Feature**: `002-user-center-api-keys`
**Mandate**: Constitution P12 (Native Web Navigation) + `docs/architecture/mandates.md` § Frontend Routing.

All new URLs are real, bookmarkable, server-rendered pages. Browser
back/forward/refresh/deep-link/open-in-new-tab work everywhere. No SPA behavior.

---

## New URLs

### User Center

| URL | Auth | Description |
|---|---|---|
| `/user-center` | signed-in | Redirects to `/user-center/profile` |
| `/user-center/profile` | signed-in | Nickname, email, password management |
| `/user-center/preferences` | signed-in | Theme and language preferences |
| `/user-center/api-keys` | signed-in | API key list, create, reveal, revoke |
| `/user-center/audit` | signed-in | Personal API audit log (own keys only) |

**Navigation**: A "User Center" entry is added to the header (user icon),
visible to all signed-in users. Within the User Center, a sidebar or tab
navigation links between the four sections. Each section is a distinct URL.

**Anonymous redirect**: If an anonymous user visits any `/user-center/**` URL,
they are redirected to `/auth/login` (consistent with the existing protected-
surface pattern).

### Admin API Audit

| URL | Auth | Description |
|---|---|---|
| `/admin/api-audit` | admin | Global API audit log (all users, all keys) |

**Navigation**: Added to the admin navigator sidebar as a second entry
(alongside the existing `/admin/users`). Non-admins receive a 404 (no leak,
consistent with the existing `/admin/users` pattern).

### API Documentation

| URL | Auth | Description |
|---|---|---|
| `/api-docs` | public | Interactive OpenAPI documentation viewer |
| `/api/openapi.json` | public | Raw OpenAPI 3.1 JSON spec |

**Navigation**: The `/api-docs` link is added to the header (or footer) as a
"Developer" / "API Docs" link, visible to all visitors (including anonymous).
The page renders an interactive viewer (Scalar or Swagger UI) that loads
`/api/openapi.json`.

---

## Existing URLs (unchanged)

All 001 URLs remain as-is:
- `/` — wiki home (published page list)
- `/{path}` — read a published page
- `/edit/{path}` — edit a page
- `/new` — create a page
- `/history/{path}` — version history
- `/revisions/{n}/{path}` — view a revision
- `/properties/{path}` — page properties
- `/auth/login`, `/auth/register` — auth
- `/admin/users` — admin user management
- `/setup` — first-run admin setup
- `/api/**` — REST API endpoints

---

## Breadcrumbs

- `/user-center/profile` → Home › User Center › Profile
- `/user-center/preferences` → Home › User Center › Preferences
- `/user-center/api-keys` → Home › User Center › API Keys
- `/user-center/audit` → Home › User Center › Audit Log
- `/admin/api-audit` → Home › Admin › API Audit
- `/api-docs` → Home › API Docs

Breadcrumbs are server-derived from the route, consistent with the existing
`Breadcrumbs` component pattern from 001.
