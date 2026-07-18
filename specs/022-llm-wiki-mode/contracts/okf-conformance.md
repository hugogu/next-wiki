# Contract: OKF Conformance for the Generated Space

**Feature**: 022-llm-wiki-mode | **Standard**: [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

Every page in the `generated` space is an OKF concept document. The unit of conformance is the page's Markdown source; the space as a whole is exportable as a bundle via the existing Markdown+frontmatter export (005).

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

## Write-time behavior (`services/okf.ts`, invoked from `pages.create` / `pages.newDraft` when `space.kind = 'generated'`)

| Input | Result |
|---|---|
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

`source` metadata (`channel`, `url`, `sessionId`, `command`) is stored as additional frontmatter keys; appended chunks update the body only, never the stored frontmatter of prior revisions.

## Conformance checklist (maps to SC-004)

1. Every generated-space page source contains a parseable YAML frontmatter block. ✅ enforced at write
2. Every frontmatter block contains a non-empty `type`. ✅ enforced at write
3. Cross-links between generated pages use Markdown links; consumers tolerate broken links (OKF §5.3). ✅ no special handling
4. Bundle export: Markdown+frontmatter export of the space yields files readable by any OKF consumer. ✅ by construction (005 exporter unchanged)
5. `index.md` / `log.md` reserved names: the generated space does not synthesize them in this feature; if a writer creates pages named `index`/`log`, they are ordinary pages (no special semantics in-app).

## Non-goals for this feature

- No `type` taxonomy registry (producer-defined per OKF).
- No synthesized `index.md`/`log.md` (may be added by the AI curation feature, 010).
- No OKF validation of wiki or raw spaces (raw reuses the format; wiki pages are unconstrained).
