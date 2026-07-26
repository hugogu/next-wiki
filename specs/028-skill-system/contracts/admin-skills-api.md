# Contract: Skills Admin API

**Satisfies**: FR-010 – FR-017, FR-025 – FR-027, FR-031 – FR-038, FR-045, FR-046

REST + JSON under the existing `/api/ai/*` surface, documented with the project's
`next-openapi-gen` JSDoc conventions. Every route calls `can(ctx, 'manage_ai')`
before anything else; a denied request returns 403 with no body detail
(FR-017, FR-038).

Schemas live in `packages/shared/src/skills.ts` and are shared by route handlers
and the admin UI.

---

## `GET /api/ai/skills`

List the catalogue and the current rejections.

**200**

```json
{
  "skills": [
    {
      "name": "wiki-linker",
      "description": "Turn keywords that already have wiki pages into links.",
      "source": "builtin",
      "editable": true,
      "overridden": false,
      "enabled": true,
      "validationState": "valid",
      "validationError": null,
      "fileCount": 4,
      "lastUsedAt": "2026-07-25T09:14:00.000Z"
    }
  ],
  "rejected": [
    {
      "reason": "duplicate_name",
      "detail": "A built-in skill already uses this name.",
      "name": "wiki-tagger",
      "origin": { "directory": "/data/skills/my-tagger" },
      "conflictsWith": { "name": "wiki-tagger", "source": "builtin" }
    }
  ],
  "directory": {
    "configured": true,
    "basePath": "/data/skills",
    "hostPath": "./.skills",
    "readable": true,
    "notice": null,
    "lastScannedAt": "2026-07-26T02:00:00.000Z"
  }
}
```

`directory.notice` carries the informational message of FR-028 when the path is
unconfigured, missing, or unreadable; the request still returns 200.

---

## `POST /api/ai/skills`

Create an admin-authored skill.

**Request**: `{ "name": "release-notes", "description": "…" }`

Creates the row plus a `SKILL.md` seeded from name + description.

- **201** the created skill view.
- **409** `{ "code": "SKILL_NAME_TAKEN", "conflictsWith": { name, source } }`
  when the name is claimed by any registry entry (FR-016).
- **422** on a name or description failing validation.

---

## `GET /api/ai/skills/{name}`

Detail plus the file tree.

**200**

```json
{
  "name": "wiki-writer",
  "description": "…",
  "source": "builtin",
  "editable": true,
  "overridden": true,
  "enabled": true,
  "validationState": "valid",
  "files": [
    { "path": "SKILL.md", "kind": "instruction", "contentType": "text/markdown",
      "byteSize": 3120, "viewable": true, "revision": 3 },
    { "path": "scripts/link_report.py", "kind": "script",
      "contentType": "text/x-python", "byteSize": 1840, "viewable": true, "revision": 1 },
    { "path": "reference/logo.png", "kind": "reference",
      "contentType": "image/png", "byteSize": 220400, "viewable": false, "revision": 1 }
  ]
}
```

`viewable: false` carries FR-037 — the file is listed with name, type, and size
and is not openable inline.

- **404** when the name is unknown or the skill is a `duplicate_name` rejection.

---

## `PATCH /api/ai/skills/{name}`

Enable or disable. **Request**: `{ "enabled": false }` → **200** the skill view.
Applies to every source (FR-013). Audited.

## `DELETE /api/ai/skills/{name}`

Soft-delete an admin-authored skill (FR-035). **409** for `builtin` (use reset)
and `directory` (read-only) sources. Audited.

## `POST /api/ai/skills/{name}/reset`

Reset a built-in skill to its shipped default by soft-deleting the override
(FR-034). **409** for non-built-in sources. Revisions are retained. Audited.

## `POST /api/ai/skills/rescan`

Rebuild the registry from the mount without restarting (FR-027).

**200** the same body as `GET /api/ai/skills`. Bounded by R6, so this stays a
synchronous request rather than a job. Audited.

---

## `GET /api/ai/skills/{name}/files/{path...}`

**200** `{ "path", "kind", "contentType", "byteSize", "revision", "content", "editable" }`

- **404** unknown file.
- **409** `{ "code": "SKILL_FILE_NOT_VIEWABLE" }` for binary or oversized files.
- **400** `{ "code": "SKILL_PATH_INVALID" }` for any path that normalises outside
  the package (FR-029) — checked before touching storage or the filesystem.

## `PUT /api/ai/skills/{name}/files/{path...}`

Create or update. **Request**: `{ "content": "…", "revision": 3 }`

`revision` is the value the client read. Omitting it on an existing file is a
400 — the concurrency token is mandatory, not best-effort.

- **200** the updated file view with the new `revision`.
- **409** `{ "code": "SKILL_FILE_CONFLICT", "currentRevision": 4 }` (FR-036).
- **409** `{ "code": "SKILL_READ_ONLY" }` for `directory` sources (FR-024/FR-026).
- **422** `{ "code": "SKILL_INVALID", "detail": "…" }` when writing `SKILL.md`
  would leave the skill without a valid `name` or `description`; the previous
  content stays in effect (FR-033).
- **413** when the content exceeds the per-file or per-package limit.

Editing a built-in skill's file creates its override row on first write.
Every write appends a `skill_file_revisions` row.

## `DELETE /api/ai/skills/{name}/files/{path...}`

- **200** on success; appends a `delete` revision.
- **409** `SKILL_READ_ONLY` for directory sources.
- **422** when deleting `SKILL.md`, which would invalidate the package.

Rename is a `PUT` to the new path followed by a `DELETE` of the old one, recorded
as a `rename` pair in revisions.

---

## Error model

Reuses the project's existing API error envelope. Error messages never include a
filesystem path outside the skills root, a credential, or a stack trace
(FR-046).

---

## Audit events

`manage_ai`-scoped audit records for: skill create, delete, enable, disable,
reset, rescan, and every file write or delete — actor, skill name, path, and
resulting revision (FR-017, FR-032, FR-035).
