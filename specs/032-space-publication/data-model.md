# Data Model: Configurable Space Publication

## Existing entities extended

### Content space (`spaces`)

| Field | Meaning | Rules |
|---|---|---|
| `id` | Stable space identity | Existing immutable identifier. |
| `slug` | Stable internal key | Retained; never derived from a user-facing prefix. |
| `kind` | Built-in editorial behavior | Retained: `wiki`, `generated`, `raw`. |
| `name` | Internal/admin label | Existing stable label used by administrative and AI workflows; it is not configured from the Space settings UI. |
| `route_prefix` | Current public canonical first path segment | New; normalized, non-empty, globally unique, and not reserved or ambiguous. |
| `default_visibility` | Visibility applied to a new page when omitted | New; `public`, `registered`, or `restricted`. Wiki defaults to `public`; raw/generated default to `restricted`. |

The prior `anonymous_read` space switch is retired from anonymous page-read
authorization. It is preserved or removed only through the generated migration
after dependent surfaces use page visibility; it must not remain a second access
veto.

### Page (`pages`)

| Field | Meaning after this feature | Rules |
|---|---|---|
| `space_id`, `path`, `locale` | Stable page address | Canonical reader URL derives from owning space prefix and this path. |
| `visibility` | Read-access setting | `public`, `registered`, or `restricted`; it is evaluated alongside published/deleted state. |
| `current_published_version_id` | Published-reader boundary | Public reading requires a current published revision. |
| `kind`, `link_target_page_id` | Historical link data | No new active link may use these fields. Existing links are soft-deleted; fields remain for retention. |

### Page revision (`page_revisions`)

| Field | Meaning after this feature | Rules |
|---|---|---|
| `status` | Draft/published lifecycle | Public readers select only the current published revision. |
| `link_target_page_id` | Historical link data | Retained on pre-retirement revisions; never dereferenced by normal reads. |
| `source_metadata`, `original_asset_id` | Raw provenance/original bytes | Never projected publicly merely because a page is public. |

## New entities

### Space route alias

Records a formerly canonical prefix after an Administrator changes the current
prefix.

| Field | Meaning | Validation |
|---|---|---|
| `id` | Alias identity | Generated UUID. |
| `space_id` | Owning stable space | References the space. |
| `prefix` | Previous canonical prefix | Unique across active prefixes and aliases. |
| `retired_at` | When it stopped being canonical | Immutable after creation. |

An alias is redirect input only, never a second canonical URL. The resolver
performs a fresh public eligibility check before redirecting.

### Page route redirect

Records a page address that changed for a reason other than a simple prefix
rename, including an LLM Wiki-to-Copilot migration.

| Field | Meaning | Validation |
|---|---|---|
| `id` | Redirect identity | Generated UUID. |
| `legacy_route` | Complete former canonical route | Unique and never emitted as canonical. |
| `target_page_id` | Page after migration or move | References the durable page identity. |
| `reason` | Why the address changed | Includes `writing_mode_switch`; immutable. |
| `created_at` | Redirect creation time | Required. |

The resolver redirects only if the target is currently public and published;
otherwise it returns opaque not-found. The writing-mode migration uses this
record for raw/generated routes that become Wiki routes, while prefix aliases
remain the simpler same-space rename mechanism.

### Retired link record

Private audit and legacy-route record created while retiring an active link.

| Field | Meaning | Validation |
|---|---|---|
| `id` | Record identity | Generated UUID. |
| `link_page_id` | Soft-deleted former link page | Unique historic page reference. |
| `legacy_path` | Former Wiki reader path | Unique within the legacy Wiki namespace. |
| `target_page_id` | Retained target identity | Used only by protected legacy resolution. |
| `retired_by`, `retired_at` | Audit attribution | Required. |
| `disposition` | Reported outcome | `redirectable` or `unavailable`; based on fresh eligibility. |

This record is absent from regular page, revision, tree, search, export, API,
and MCP projections.

### Space configuration audit event

Existing audit infrastructure records before/after events for route prefix,
default visibility, page visibility, and link retirement. No
new general-purpose audit store is introduced.

## Relationships

```text
Content space 1 ── * Page 1 ── * Page revision
      │                    │
      │                    ├── * Page route redirect
      │                    └── 0..1 Retired link record (former links only)
      └── * Space route alias
```

## State transitions

### Page public eligibility

```text
restricted draft       ── publish ──> restricted published (not public)
public draft           ── publish ──> public published (publicly readable)
public published       ── restrict ─> restricted published (public access revoked)
public published       ── unpublish/delete ─> unavailable
```

Visibility may be saved before publication, but it never exposes a draft.

### Space prefix

```text
current prefix ── valid Admin update ──> new current prefix
             └────────────────────────> retained alias redirect
```

Invalid/reserved/colliding input makes no state change. A prefix change
invalidates current and alias routes for public pages in that space.

### Link retirement

```text
active link page ── Admin retirement ──> soft-deleted page + retired record
                                              │
                          public current target ─> redirect legacy route
                          otherwise             ─> opaque not-found
```

No transition returns a retired link to active content in this feature.

### Writing-mode migration address transition

```text
/w/wiki-page                 ── mode switch ──> /w/wiki-page
/g/concepts/payment          ── Copilot move ─> /w/generated/concepts/payment
/r/sources/notice            ── Copilot move ─> /w/raw/sources/notice
```

The Wiki prefix is unchanged. The old generated/raw address is recorded as a
conditional page-route redirect; inactive-space prefix settings remain stored
for a later LLM Wiki reactivation.
