# Data Model: AI Image Tools

## Existing Entities Reused

| Entity | Relevant fields / relations | Feature use |
| --- | --- | --- |
| `ai_actions` | action ID, tenant/account/user actor, feature, status, timestamps, error state | Parent record for every generation. Existing image actions retain their normal queued/running/terminal lifecycle. |
| `ai_action_inputs` | encrypted action input | Holds the existing validated page/revision/selection generation input; it is never returned by public REST/MCP/Wiki AI results. |
| `ai_action_events` | action ID, event type, safe payload, timestamps | Records state transitions and safe generation/tool lifecycle information. |
| `ai_generated_artifacts` | unique action ID, content type, byte size, storage reference, expiry, promoted asset ID | Holds exactly one generated image for an image action; exposes an authenticated preview and records one idempotent promotion. |
| `content_assets` | asset ID, owner, storage object, MIME type, filename, content reference | Normal image-upload destination after promotion; existing Markdown/reference and orphan cleanup behavior apply. |
| API audit entries | actor/key, route, status, metadata | Adds safe public REST audit linkage for page, action, artifact, and asset identifiers. |
| API key | owning account, role, allowed scopes | Authorizes externally initiated media actions. |
| AI tool configuration | static tool ID, category, enabled/review policy | Governs Wiki AI media-tool availability independently from other tools. |

## Additive Enum Changes

| Enum / shared type | New value | Purpose |
| --- | --- | --- |
| API key scopes (`packages/shared/src/api-keys.ts` and Drizzle enum mirror) | `ai.image` | Narrow public permission for provider-backed image generation and generated-artifact lifecycle operations. |
| AI tool categories (`packages/shared/src/ai-tools.ts` and Drizzle enum mirror) | `media` | Admin-configurable category for built-in Wiki AI media tools. |

Both values require a schema edit followed by one generated Drizzle migration. The migration, snapshot, and journal entry must be emitted by `pnpm db:generate`; no hand-authored migration SQL is permitted.

## Relationships

```text
API key / interactive user
        │ authorizes and owns
        ▼
     AI action ── 1:1 ──> generated artifact ── 0..1 promoted to ──> content asset
        │                         │                                      │
        ├── action events          └── private object storage              └── normal Markdown reference
        └── encrypted input                                                     in a later page revision
```

An action stores the originating page/revision identity. Promotion requires an explicit target `pageId`, checks that it matches the action’s bound page, and records the resulting asset ID on the artifact. A page relationship starts only when a separate normal draft saves the returned Markdown.

## State and Retention

| Resource | States / rule | Retention and visibility |
| --- | --- | --- |
| Image action | `queued` → `running` → `completed` / `failed` / `cancelled`; existing action expiry cleanup maps terminal results to safe public state | Accessible only to its actor/owning API-key account with `ai.image`; cross-owner and missing resources are both not found. |
| Generated artifact | created only by a successful action; discarded, promoted, or expires | Private preview only; unpromoted artifact storage is removed by existing expiry cleanup. |
| Promoted content asset | normal existing asset lifecycle | Private to the owner when unreferenced, then subject to normal page-reference visibility and orphan cleanup. Promotion never makes it anonymous/public by itself. |

## Validation and Invariants

- An image-generation input must use the existing page/revision and page-or-selection source schema, including selection hash verification.
- The configured model must have the `image_generation` capability and the actor must retain image entitlement at run time.
- Only an active Editor/Admin actor with the required scope can submit or promote; authorization is rechecked by queued/inline execution before provider access.
- An artifact belongs to one action and can promote to at most one asset. Repeated promotion returns the same existing asset.
- Public representations contain IDs, timestamps, state, MIME/size, and safe URLs only. They never contain source text, raw prompt, stored bytes, model credentials, or internal provider diagnostics.
- No entity or field changes a page revision, draft, publication state, embedding, or cache tag.
