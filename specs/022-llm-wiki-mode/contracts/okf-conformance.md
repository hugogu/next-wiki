# Contract: OKF Conformance for the Generated Space

**Feature**: 022-llm-wiki-mode | **Standard**: [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

Every page in the `generated` space is an OKF concept document. The unit of stored conformance is the page's Markdown source; the unit of interchange conformance is the generated-space OKF export defined below. The existing portable exporter is not an OKF exporter because it adds next-wiki transport frontmatter ahead of the concept source.

## Page source shape

```markdown
---
type: <string, REQUIRED, non-empty>
title: <string, recommended — defaults to page title>
description: <string, optional one-liner>
tags: [<string>, …]            # optional
timestamp: <ISO 8601, injected on create>
resource: <URI, optional>
# …any additional producer keys preserved untouched
---

<Markdown body>
```

## Write-time behavior (`services/okf.ts`, invoked from `pages.create` / `pages.newDraft` and path-changing `pages.updateProperties` when `space.kind = 'generated'`)

| Input | Result |
|---|---|
| Path whose normalized final segment is `index` or `log` | Reject `422 OKF_RESERVED_PATH`; these names have reserved bundle semantics and are not concept documents |
| No frontmatter block | Inject `---\ntype: Note\ntitle: <page title>\ntimestamp: <now>\n---` above the body |
| Frontmatter present, `type` non-empty | Accept unchanged (unknown keys preserved per OKF §9) |
| Frontmatter present, `type` missing/empty | Reject `422 OKF_TYPE_REQUIRED` |
| Unparseable YAML block | Reject `422 OKF_TYPE_REQUIRED` with parse detail |

## Raw entries reuse the same channel

Raw input kinds map onto OKF `type` so one filter (`filterType`) serves both spaces (research D4/D12):

| `inputKind` | Stored frontmatter `type` |
|---|---|
| `chat-transcript` | `chat-transcript` |
| `external-fetch` | `external-fetch` |
| `script-run` | `script-run` |
| `manual-note` | `manual-note` |

Initial `source` metadata (`channel`, `url`, `sessionId`, `command`, `occurredAt`) is stored as additional frontmatter keys. The initial revision and every append revision also store that chunk's metadata in immutable `page_revisions.source_metadata`; appended chunks update the body only and never rewrite the stored frontmatter or bytes of prior revisions.

## Generated-space bundle export

The existing transfer endpoint accepts:

```json
{
  "kind": "site_export",
  "options": {
    "space": "generated",
    "format": "okf"
  }
}
```

The existing transfer queue remains responsible for the asynchronous job and artifact lifecycle. The OKF branch:

1. Captures the latest revision of every non-deleted page in the generated space, including drafts.
2. Writes each source to `pages/<locale>/<path>.md` through `transfers/okf-archive-writer.ts`; it does not call the portable archive writer or prepend transport frontmatter.
3. Preserves the original concept frontmatter byte-for-byte and rewrites only local asset URLs in the Markdown body when bundling assets.
4. Includes no synthesized `index.md` or `log.md`; both files are optional in OKF v0.1.
5. Validates every Markdown entry for parseable frontmatter, non-empty `type`, and non-reserved path before completing the artifact.

JSON manifests, reports, and binary assets may coexist in the ZIP because OKF conformance applies to the Markdown tree.

## Conformance checklist (maps to SC-004)

1. Every generated-space concept path avoids reserved `index.md` / `log.md`. Enforced at write and rechecked at export.
2. Every generated-space page source contains a parseable YAML frontmatter block. Enforced at write.
3. Every frontmatter block contains a non-empty `type`. Enforced at write.
4. Cross-links between generated pages use standard Markdown syntax; consumers tolerate broken links (OKF §5.3). No special storage handling required.
5. Bundle export preserves each concept source and validates every emitted Markdown file. Enforced by the dedicated OKF archive writer.

## Non-goals for this feature

- No `type` taxonomy registry (producer-defined per OKF).
- No synthesized `index.md`/`log.md` (they are optional and may be added later with their required reserved-file structure).
- No OKF validation of wiki or raw spaces (raw reuses the format; wiki pages are unconstrained).
