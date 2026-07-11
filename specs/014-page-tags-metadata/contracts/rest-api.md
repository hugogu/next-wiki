# REST and MCP Contract: Page Tags and Metadata

All operations use the existing v1 adapter, error envelope, API-key scopes,
pagination, audit handling, and OpenAPI generation. Raw `frontmatter` and
existing `filter[tag]` behavior remain supported.

## Additive page metadata

Page, list, and search resources gain optional structured metadata while
retaining top-level canonical `title` and raw frontmatter:

```json
{
  "title": "Official runner in Docker",
  "frontmatter": { "tags": ["devops"] },
  "metadata": {
    "date": "2026-07-10",
    "summary": "A migration note.",
    "tags": [{ "id": "uuid", "name": "devops", "normalizedName": "devops" }]
  }
}
```

Date and summary are omitted when absent. Tags is an empty array when the
metadata projection is present but the revision has no tags.

## Page metadata resource

### `PATCH /v1/pages/{pageId}/metadata`

Requires `edit` and normal page-level authorization. The body includes a
required `baseRevisionId` plus optional `title`, `date`, `tags`, and `summary`.
An omitted field is unchanged; `null` clears date/tags/summary; title cannot be
null. The response is the updated page resource and one new revision. The
existing generic page PATCH and batch frontmatter patch keep their semantics.

## Tag resources

| Operation | Resource | Authorization | Result |
| --- | --- | --- | --- |
| List | `GET /v1/tags?q=&limit=&cursor=` | `view` | Cursor tag directory and visibility-safe count. |
| Create | `POST /v1/tags` | `manage_tags` | New active tag. |
| Rename | `PATCH /v1/tags/{tagId}` | `manage_tags` | `202` tag-mutation operation. |
| Retire | `DELETE /v1/tags/{tagId}` | `manage_tags` | `202` tag-mutation operation. |
| Status | `GET /v1/tag-mutations/{operationId}` | requester/admin | Operation state and completion summary. |

Duplicate normalized names are validation/conflict errors. Completed mutation
counts never disclose inaccessible pages. `filter[tag]` remains accepted;
MCP preserves `filterTag` and can add multi-value `filterTags`.

## MCP tools

Existing `get_page`, `list_pages`, and `search_wiki` expose additive metadata.
Add `list_tags`, `create_tag`, `rename_tag`, `delete_tag`, `get_tag_mutation`,
and `update_page_metadata`. Tools use the v1 client, so they share REST
permissions and errors. MCP Markdown resources keep their current URI/MIME
contract.
