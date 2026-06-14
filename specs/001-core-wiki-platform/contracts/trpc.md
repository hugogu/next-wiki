# tRPC Procedure Contract (internal API)

**Feature**: `001-core-wiki-platform`
**Mandate**: Constitution P8 + `docs/architecture/mandates.md` § API Architecture.

tRPC is the **internal** API between the Next.js frontend and the service layer.
All input/output is validated with shared Zod schemas (`packages/shared`).
Every procedure constructs a permission context and delegates to a service,
which enforces `can(actor, action, resource)` before any data leaves (P4/D3).

Public REST + MCP are **deferferred** for this slice (spec A11); they will be
derived from these same procedures/services later.

## Routers

### `auth`

| Procedure | Type | Input | Output | Notes |
|---|---|---|---|---|
| `register` | mutation | `{ email, password }` | `{ userId }` | creates user (role=reader); establishes session |
| `login` | mutation | `{ email, password }` | `{ userId }` | establishes session; rejects if disabled |
| `logout` | mutation | `{}` | `{ ok }` | destroys session |
| `me` | query | `{}` | `{ id, email, role, displayName } \| null` | current actor |

### `pages`

| Procedure | Type | Input | Output | Notes |
|---|---|---|---|---|
| `listPublished` | query | `{}` | `PageSummary[]` | published pages only; honors anonymous_read |
| `getLive` | query | `{ slug }` | `LivePage \| null` | live revision HTML; 404-style null for drafts to non-authors |
| `create` | mutation | `{ slug, title, contentSource }` | `{ pageId, versionId }` | editor/admin; slug unique check |
| `newDraft` | mutation | `{ slug, contentSource, title? }` | `{ versionId, versionNumber }` | creates a new draft revision of an existing page |
| `getForEdit` | query | `{ slug }` | `EditableView \| null` | latest revision source for the editor; editor/admin (or author) |
| `getHistory` | query | `{ slug }` | `RevisionSummary[]` | author/editor/admin |
| `getRevision` | query | `{ slug, version }` | `RevisionView \| null` | draft revisions: author/admin only |

### `revisions`

| Procedure | Type | Input | Output | Notes |
|---|---|---|---|---|
| `publish` | mutation | `{ slug, version }` | `{ versionId }` | author-of-draft / admin; sets live version atomically |

### `users` (admin)

| Procedure | Type | Input | Output | Notes |
|---|---|---|---|---|
| `list` | query | `{}` | `UserView[]` | admin only |
| `setRole` | mutation | `{ userId, role }` | `{ ok }` | admin only; effective next request |
| `setStatus` | mutation | `{ userId, status }` | `{ ok }` | admin only; disable blocks login |
| `resetPassword` | mutation | `{ userId, tempPassword }` | `{ ok }` | admin only; sets `must_reset_password=true` |
| `setMyPassword` | mutation | `{ newPassword }` | `{ ok }` | signed-in; required when `must_reset_password` |

## Shared types (in `packages/shared`)

- `PageSummary { slug, title, authorId, updatedAt }`
- `LivePage { slug, title, contentHtml, contentHash, version, publishedAt, authorDisplayName }`
- `EditableView { slug, title, contentSource, latestVersion, status }`
- `RevisionSummary { version, status, authorDisplayName, createdAt, contentHash }`
- `RevisionView { version, status, contentHtml, contentSource, authorDisplayName, createdAt }`
- `UserView { id, email, role, status, displayName, createdAt }`

All mutation inputs are Zod-validated server-side; the same schemas drive client
inference. Procedures never return fields the caller cannot see (e.g. draft
`contentHtml` for non-authors).
