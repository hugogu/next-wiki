# Contract: Portable Archive v1

## Media Type and Encoding

- File extension: `.zip`
- Download/upload media type: `application/zip`
- Text files: UTF-8 without BOM
- Format identifier: `next-wiki-portable`
- Format version: integer `1`

## Layout

```text
manifest.json
pages/
  en/
    getting-started.md
    engineering/backend/auth.md
assets/
  31d6...ab2.png
  9f20...dd1.webp
reports/
  export.json
```

Rules:

- Entry names use `/`, are relative, NFC-normalized, and contain no empty,
  `.` or `..` segment.
- Backslashes, drive prefixes, NUL, control characters, absolute paths, and
  symbolic links are prohibited.
- Entries not declared in `manifest.json` are rejected except the manifest
  itself.
- Duplicate names after Unicode/case/path normalization are rejected.
- Page entry path is `pages/{locale}/{path}.md`.
- Asset entry path is `assets/{sha256}.{extension}`.

## `manifest.json`

```json
{
  "format": "next-wiki-portable",
  "version": 1,
  "createdAt": "2026-06-21T12:00:00.000Z",
  "source": {
    "instanceId": "2bb5cdd7-...",
    "product": "next-wiki",
    "version": "0.1.0"
  },
  "snapshot": {
    "spaceSlug": "default",
    "capturedAt": "2026-06-21T11:59:58.000Z"
  },
  "counts": {
    "pages": 2,
    "assets": 2
  },
  "pages": [
    {
      "id": "source-page-uuid",
      "entry": "pages/en/getting-started.md",
      "path": "getting-started",
      "locale": "en",
      "title": "Getting Started",
      "contentType": "text/markdown",
      "contentHash": "sha256-hex",
      "sizeBytes": 1234,
      "revisionId": "source-revision-uuid",
      "publishedAt": "2026-06-20T10:00:00.000Z",
      "createdAt": "2026-06-19T10:00:00.000Z",
      "updatedAt": "2026-06-20T10:00:00.000Z",
      "assetIds": ["sha256-hex"]
    }
  ],
  "assets": [
    {
      "id": "sha256-hex",
      "entry": "assets/sha256-hex.png",
      "contentHash": "sha256-hex",
      "contentType": "image/png",
      "sizeBytes": 4096,
      "sourceAssetId": "source-asset-uuid"
    }
  ],
  "files": [
    {
      "entry": "pages/en/getting-started.md",
      "sha256": "sha256-hex",
      "sizeBytes": 1234
    }
  ]
}
```

`files` contains every declared page, asset, and report entry and is used for
integrity validation. Manifest counts must equal array lengths.

## Page Frontmatter

```markdown
---
nextWikiArchiveVersion: 1
sourcePageId: "source-page-uuid"
sourceRevisionId: "source-revision-uuid"
path: "getting-started"
locale: "en"
title: "Getting Started"
contentType: "text/markdown"
publishedAt: "2026-06-20T10:00:00.000Z"
createdAt: "2026-06-19T10:00:00.000Z"
updatedAt: "2026-06-20T10:00:00.000Z"
---

# Original Markdown starts here
```

The manifest is authoritative if duplicate metadata differs. A mismatch between
manifest and frontmatter is a validation error rather than an implicit choice.

## Asset References

Within archived Markdown, local next-wiki asset URLs are rewritten to portable
relative paths:

```markdown
![Diagram](../../assets/31d6...ab2.png)
```

The importer resolves only paths declared for that page in the manifest and
rewrites them to target-local `/api/assets/{targetAssetId}` URLs.

External non-local URLs remain unchanged in a next-wiki archive export and are
listed as warnings in `reports/export.json`; archive import does not fetch them.

## Compatibility

- Importer MUST accept version `1`.
- Unknown major versions are rejected before content changes.
- Unknown optional fields are ignored and preserved only in the report.
- Missing required fields or checksum mismatches reject preview.
- Export ordering is deterministic by `(locale, path)` and content hash so the
  same snapshot yields reproducible entry ordering.

## Safety Limits

Defaults, configurable by deployment:

- compressed upload: 2 GiB
- expanded total: 4 GiB
- entries: 50,000
- per Markdown entry: 10 MiB
- per image: existing content asset maximum
- compression ratio: 100:1 per entry and archive-wide
- filename length: 512 bytes
- manifest JSON: 10 MiB

The parser validates central-directory metadata first and enforces byte counters
again while streaming each entry.
