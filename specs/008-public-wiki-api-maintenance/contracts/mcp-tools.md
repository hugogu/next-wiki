# Contract: MCP Tools (Maintenance & Intelligence)

Six new MCP tools, each mapping 1:1 to a v1 REST endpoint. All follow the
existing MCP tool conventions: `snake_case` names, flattened LLM-friendly
response shapes, no raw HTTP envelopes.

## delete_page

**Maps to**: `DELETE /v1/pages/{id}`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| pageId | string (uuid) | yes | ID of the page to soft-delete |

**Response**: `{ deleted: true, id: string, path: string }`

---

## get_backlinks

**Maps to**: `GET /v1/pages/{id}/backlinks`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| pageId | string (uuid) | yes | ID of the target page |

**Response**:
```json
{
  "backlinks": [
    { "pageId": "...", "path": "docs/overview", "title": "Overview", "linkText": "see intro" }
  ]
}
```

---

## get_diff

**Maps to**: `GET /v1/pages/{id}/revisions/{version}/diff?against={fromVersion}`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| pageId | string (uuid) | yes | Page ID |
| version | number (int) | yes | The "to" version |
| against | number (int) | yes | The "from" version to diff against |

**Response**: `{ fromVersion, toVersion, diff: string, additions: number, deletions: number }`

---

## batch_create_pages

**Maps to**: `POST /v1/pages/batch`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| pages | array | yes | 1-50 page definitions, each `{ path, title, contentSource, locale? }` |

**Response**: `{ created: [{ id, path, revisionId }], count: number }`

---

## get_stats

**Maps to**: `GET /v1/stats`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| includeOrphans | boolean | no | Include orphan page detection (default false) |

**Response**:
```json
{
  "totalPages": 42,
  "publishedPages": 38,
  "draftPages": 3,
  "deletedPages": 1,
  "recentActivity": { "createdInLast7Days": 5, "updatedInLast7Days": 12 },
  "directories": [{ "segment": "docs", "pageCount": 15 }]
}
```

---

## find_similar

**Maps to**: `POST /v1/search/similar`

**Parameters**:
| Name | Type | Required | Description |
|---|---|---|---|
| title | string | no* | Proposed page title |
| path | string | no* | Proposed page path |
| threshold | number | no | Minimum similarity score [0,1], default 0.5 |

*At least one of `title` or `path` must be provided.

**Response**:
```json
{
  "results": [{ "pageId": "...", "path": "...", "title": "...", "score": 0.92 }],
  "threshold": 0.5
}
```
