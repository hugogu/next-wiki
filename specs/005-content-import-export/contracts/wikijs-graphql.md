# Contract: Wiki.js GraphQL Import

## Endpoint and Authentication

- Supported source: Wiki.js 2.2+
- Endpoint: `{normalizedBaseUrl}/graphql`
- Header: `Authorization: Bearer {apiToken}`
- Request: JSON GraphQL POST
- Required source permissions:
  - `read:pages`
  - `read:source` (or `manage:system`)
  - `read:assets` for asset metadata when queried

Connection tests issue the inventory query with a limit of one, then fetch that
page's source when present. A token that can list but not read source is rejected
for migration.

## Inventory Query

```graphql
query NextWikiPageInventory {
  pages {
    list(orderBy: ID, orderByDirection: ASC) {
      id
      path
      locale
      title
      description
      contentType
      isPublished
      isPrivate
      createdAt
      updatedAt
      tags
    }
  }
}
```

Wiki.js applies source-token permissions to the returned list. The preview
reports that discovery is permission-limited and cannot infer hidden counts.

Only `isPublished: true` pages are planned for import in v1. Private source flags
are reported but not recreated as target permissions.

## Page Source Query

```graphql
query NextWikiPageSource($id: Int!) {
  pages {
    single(id: $id) {
      id
      path
      title
      description
      content
      contentType
      editor
      locale
      createdAt
      updatedAt
      tags {
        tag
        title
      }
      authorName
      creatorName
    }
  }
}
```

Required validation:

- GraphQL HTTP response succeeds.
- `errors` is absent/empty.
- `data.pages.single` exists and matches requested id.
- Path, locale, title, content type, editor, and content fit configured limits.
- A page fingerprint is SHA-256 over normalized source fields and content.

## Supported Conversion Registry

| Predicate | Converter | Result |
|-----------|-----------|--------|
| `contentType == text/markdown` or `editor == markdown` | Markdown identity | Source preserved |
| `contentType == text/html` or `editor == ckeditor` | HTML-to-Markdown | Item marked `convert` |
| Other | None | Item marked unsupported/skipped |

HTML conversion preserves standard headings, paragraphs, emphasis, lists,
links, images, blockquotes, fenced code, tables, and line breaks. Scripts,
styles, event handlers, iframes, forms, and unsafe embedded content are removed.

## Image Discovery and Download

Image references are parsed from the source after conversion:

- Markdown images and image references
- HTML `<img src>` handled before/while HTML conversion
- Root-relative `/path`, relative `path`, and absolute HTTP(S) URLs
- Query strings/fragments are retained for source resolution but removed from
  target identity after bytes are hashed

Resolution:

1. Relative references resolve against the source page public URL and base URL.
2. Same-origin Wiki.js asset requests receive the Bearer token.
3. Cross-origin image requests never receive the token.
4. Every URL/redirect is validated by the safe remote-fetch policy.
5. Only validated PNG/JPEG/GIF/WebP bytes within the configured maximum are
   stored.
6. Target identity is content SHA-256; duplicate bytes reuse one asset.
7. Source Markdown is rewritten to `/api/assets/{targetAssetId}`.

The GraphQL asset queries may be used to enrich same-origin metadata:

```graphql
query NextWikiAssetFolders($parentFolderId: Int!) {
  assets {
    folders(parentFolderId: $parentFolderId) { id slug name }
  }
}

query NextWikiAssets($folderId: Int!) {
  assets {
    list(folderId: $folderId, kind: IMAGE) {
      id filename ext mime fileSize createdAt updatedAt
      folder { id slug name }
    }
  }
}
```

They are not required to fetch unreferenced assets and do not replace byte
validation.

## Error Normalization

GraphQL `errors`, Wiki.js permission failures, non-JSON responses, missing
fields, and inconsistent ids are normalized into stable source error codes.
Raw token values, full response bodies, and imported page content are excluded
from logs and run errors.

Rate limits and transient network failures are retryable with capped exponential
backoff. Authentication and permission failures are not retried until source
credentials change.
