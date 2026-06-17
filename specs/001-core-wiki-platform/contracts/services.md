# Service-Layer Interface

**Feature**: `001-core-wiki-platform`
**Mandate**: Constitution P8/P9 + `docs/architecture/mandates.md` § API Architecture.

The service layer is the **only** place business logic lives. REST route handlers
(this slice) and future MCP adapters are thin callers of these services. Each
function takes an explicit **permission context** and enforces
`can(actor, action, resource)` (P4/D3). No global singletons; dependencies are
injected (DB handle, pipeline, etc.).

## Permission context

```ts
type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: 'admin' | 'editor' | 'reader' };

type PermCtx = {
  actor: Actor;
  // services resolve anonymous_read from the target space internally
};

declare function can(ctx: PermCtx, action: Action, resource: Resource): boolean;
```

`Action = 'read' | 'read_draft' | 'create' | 'edit' | 'publish' | 'manage_users'`.
`Resource = { kind: 'page_list' } | { kind: 'page'; pageId } | { kind: 'revision'; pageId; version } | { kind: 'users' }`.

Resolution order for this slice: explicit role → authorship → anonymous_read
default. This is the single interpreter of the permission matrix in
`data-model.md`; per-page overrides are deferred (A7).

## `authService`

```ts
register(input: { email, password }): Promise<{ userId }>
login(input: { email, password }): Promise<{ userId }>
logout(sessionId: string): Promise<void>
getCurrentActor(request): Promise<Actor>            // session → user → role per request (D8)
```

## `pageService` (all take PermCtx as first arg)

```ts
listPublished(ctx): Promise<PageSummary[]>
getLive(ctx, slug): Promise<LivePage | null>         // null = not-visible (draft to non-author)
getForEdit(ctx, slug): Promise<EditableView | null>  // editor/admin/author; latest revision source
getHistory(ctx, slug): Promise<RevisionSummary[]>
getRevision(ctx, slug, version): Promise<RevisionView | null>

create(ctx, input: { slug, title, contentSource }): Promise<{ pageId, versionId }>
//  - validates slug (regex + unique within space)
//  - renders Markdown→HTML via pipeline, computes hash, stores both (D1)
//  - creates page + first revision (status=draft)
//  - permission: can(ctx,'create',{kind:'page_list'})

newDraft(ctx, input: { slug, contentSource, title? }): Promise<{ versionId, versionNumber }>
//  - appends a new draft revision; version_number = max+1 in same txn
//  - permission: can(ctx,'edit',{kind:'page',pageId})

publish(ctx, input: { slug, version }): Promise<{ versionId }>
//  - permission: author-of-draft or admin
//  - sets revision status=published, published_at=now()
//  - atomically updates pages.current_published_version_id + latest_version_id
```

## `userService` (admin)

```ts
list(ctx): Promise<UserView[]>                       // can(ctx,'manage_users')
setRole(ctx, userId, role): Promise<void>            // effective next request (D8)
setStatus(ctx, userId, status): Promise<void>
resetPassword(ctx, userId, tempPassword): Promise<void>  // sets must_reset_password=true
setMyPassword(ctx, newPassword): Promise<void>        // clears must_reset_password
```

## `pipeline` (rendering — P3)

```ts
renderMarkdown(source: string): { html: string; hash: string }
//  source -> parse (remark) -> transform[] (rehype plugins) -> render (html)
//  pure; no DB access; deterministic; cacheable per hash (D1)
```

## Boundary rules

- Route handlers call services; services call Drizzle + pipeline + `can()`.
- Services never read the session directly — they receive an `Actor` from the
  route handler's `getCurrentActor`.
- No service returns a draft's content to a caller that fails `can('read_draft')`;
  not-found semantics are decided in the service, not the route.
- All mutations run in a Drizzle transaction where version numbering / publish
  swaps must be atomic.
