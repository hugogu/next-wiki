# Space Settings and Page Contract

## Administrator Space settings

### Read settings

`GET /api/settings/spaces`

Authentication: Admin session only.

Returns one item for each enabled built-in space:

```json
{
  "spaces": [
    {
      "id": "space UUID",
      "kind": "wiki",
      "routePrefix": "wiki",
      "defaultVisibility": "public",
      "isActive": true
    }
  ]
}
```

Internal slugs, aliases, retired links, and target identifiers are not returned
to non-Admin callers.

The Wiki route prefix remains active and stable in both writing modes. Raw and
generated settings remain visible to Administrators as inactive configuration
while Copilot mode is selected; their prefix values are retained for a later
LLM Wiki reactivation.

### Update one space

`PUT /api/settings/spaces/{spaceId}`

Authentication: Admin session only.

```json
{
  "routePrefix": "g",
  "defaultVisibility": "restricted"
}
```

Success returns updated public-safe configuration and canonical workspace/public
roots. Invalid input returns a validation error; reserved, duplicate, or
content-colliding prefixes return a conflict error. The operation is atomic and
audited.

## Page visibility

Existing page create/update/property surfaces gain or retain:

```json
{ "visibility": "public" }
```

Only an Administrator may change visibility. The setting is durable even for a
draft, but anonymous read occurs only after normal publication. Create requests
without visibility use the owning space's `defaultVisibility`.

Page read/list/search responses include a server-resolved canonical URL when
the caller may see the page. Public callers receive only public safe fields.

## Retired link behavior

The following are removed from active external contracts:

- page create/update `kind: "link"`;
- `linkTargetPageId` inputs;
- `linkTarget` and historical `linkTargetPageId` response fields; and
- link-specific create, retarget, and publication behaviors.

Calls that supply retired inputs fail clearly with a documented
unsupported-operation error and make no mutation. The public OpenAPI document
and MCP page shapes are regenerated from the shared contract; neither exposes
retired-link records.

## Link-retirement operation

The Admin-only retirement endpoint starts or reports the idempotent transition.
Its response may include the aggregate retired count and an Admin-safe report
reference. Detailed former paths/targets are never public or available through
API keys. Repeated invocation reports completion without retiring a row twice.
