# Create-Page Flow Redesign: Popup-First Draft Creation

Status: Approved for planning
Date: 2026-07-04
Components: `CreatePageForm`, `PagePropertiesPanel`, `EditPageForm`, `POST /api/v1/pages`

## Problem

`/new` currently renders a full `SplitMarkdownEditor` immediately, with an
optional slide-in "page properties" drawer for title/path. The whole thing
(title + path + content) is submitted in one shot to `POST /api/v1/pages`,
which then hard-redirects to the published page view (`/{path}`).

Two problems fall out of this:

1. **AI features are invisible on `/new`.** `SplitMarkdownEditor`'s AI
   optimize/generate-image buttons are gated on `pageId && revisionId`
   being present — correctly, since both AI dialogs require them as
   non-optional props and send them to the backend for permission/audit
   purposes. `CreatePageForm` never has real ids until the page is
   created, so the buttons never render there, even though it's the exact
   same `SplitMarkdownEditor` component `EditPageForm` uses (confirmed: no
   duplicated toolbar — this was investigated and ruled out during
   brainstorming).
2. **Content is required to create a page at all.** `POST /api/v1/pages`
   requires non-empty `contentSource`
   (`packages/shared/src/pages.ts:152-157`), so there's no way to create a
   page skeleton (title + path) and fill in content afterward — unlike
   editing, where a draft can be saved with any content and published
   separately.

## Goals

1. Creating a page becomes two phases: **collect title + path in a
   popup, create a real (draft, unpublished) page immediately**, then
   **hand off entirely to the existing edit flow** for writing content —
   so AI features are available from the first keystroke.
2. **One feature, one API.** The public, documented `POST /api/v1/pages`
   (the same "stable Public Wiki Content API" the MCP server and external
   API-key consumers use) gains the ability to create a page with empty
   content. No parallel internal-only endpoint. Docs regenerated via the
   existing `openapi:generate` script (`next-openapi-gen`).
3. `PagePropertiesPanel`'s presentation changes from an absolute-positioned
   drawer to a modal popup, consistently, everywhere it's used (both the
   new pre-creation flow and the existing mid-edit "toggle properties"
   affordance in `EditPageForm`).

## Non-goals

- No change to how publishing works, or to the revision/draft data model.
- No change to `EditPageForm`'s save mechanics (`PATCH .../pages/{id}` for
  properties, `POST .../pages/{id}/drafts` for content) — the new flow
  hands off to this unchanged machinery as soon as the page exists.
- The legacy internal page list/create and path-based page routes are not part
  of the page-creation flow. They were later removed in favor of the stable
  `/api/v1/pages` content API, with e2e coverage migrated to the public API
  surface.

## Design

### 1. Public API: make `contentSource` optional

`packages/shared/src/pages.ts:152-157`:

```ts
export const publicPageCreateInputSchema = z.object({
  path: pathSchema,
  locale: z.string().min(1).max(20).optional(),
  title: z.string().min(1).max(200),
  contentSource: z.string().default(''),
});
```

(was `z.string().min(1)`). This is backward compatible: existing callers
sending non-empty content are unaffected; callers omitting it or sending
`''` now succeed instead of getting a 400. `publicPageBatchCreateInputSchema`
(`packages/shared/src/pages.ts:266`) reuses this schema, so batch-create
gets the same relaxation for free — each item in a batch may now omit
content too.

Neither `pageService.create()` (`apps/web/src/server/services/pages.ts:267`)
nor `publicContent.createPage()` (`apps/web/src/server/services/public-content.ts:407`,
which just calls `pageService.create()` and re-fetches the shaped
resource) impose their own content-length checks — the `min(1)` lived
purely in the zod schema, confirmed by reading both. So this is a
one-line schema change; no service-layer change needed.

Update the route's `@openapi` JSDoc description
(`apps/web/app/api/v1/pages/route.ts:26-37`) to note content is optional
and defaults to an empty draft, then regenerate docs:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

### 2. Component split: `PagePropertiesFields` + two dialogs

**`PagePropertiesFields`** (new, `apps/web/src/components/editor/PagePropertiesFields.tsx`):
the title input, path input, and their error messages — exactly the
inner content of today's `PagePropertiesPanel`
(`apps/web/src/components/editor/PagePropertiesPanel.tsx:24-60`), minus
the outer `<div className="absolute inset-y-0 right-0 w-80 ...">`
wrapper. Same props (`title`, `onTitleChange`, `titleError`, `path`,
`onPathChange`, `pathError`, `pathReadOnly`).

**`PagePropertiesPanel`** (modified, same file/name — kept for
`EditPageForm`'s existing mid-edit "toggle properties" use): now wraps
`PagePropertiesFields` in `ModalDialog`
(`apps/web/src/components/ui/ModalDialog.tsx`, the same component
`ConfirmDialog` and the AI dialogs already use — Esc to close,
backdrop-click to close, focus trap/restore). Gains a required `onClose`
prop. `EditPageForm.tsx:144-153`'s call site adds `onClose={toggleProperties}`
— everything else about that call site is unchanged.

**`NewPageDialog`** (new, `apps/web/src/components/pages/NewPageDialog.tsx`):
also wraps `PagePropertiesFields` in `ModalDialog`, but with a title of
"New page", an explicit "Create" submit button (not the global toolbar
Save — there is no toolbar yet at this point), and `onClose` meaning
"abandon and navigate away" rather than "dismiss and keep editing".

### 3. `CreatePageForm` becomes a thin bootstrap

`CreatePageForm.tsx` no longer renders `SplitMarkdownEditor` at all. New
shape:

- Renders `NewPageDialog`, open from mount (no toggle — this is the only
  thing on `/new` now).
- On submit: `apiPost(getPublicApiPagesUrl(), { path, title })` (no
  `contentSource` — relies on the new default).
- On success: `window.location.href = getEditHref(data.path)` — full
  navigation into the existing `/edit/[...path]` route, which does its
  own server-side data load and renders `EditPageForm` exactly as it does
  for any other page. No editor-mounting logic is duplicated in
  `CreatePageForm`.
- On close/cancel before submitting: nothing was created; same
  `goBack('/')` behavior `close()` already has today.
- No longer calls `setEditor(...)` — there's no toolbar to drive while
  the dialog is up. `Header.tsx:105` (`useEditor()`) naturally renders
  its default (non-editor) chrome during this phase, since `editor` is
  `null` — confirmed this is exactly how `Header` already decides whether
  to show the save/close/properties buttons.

## Error handling & edge cases

| Case | Handling |
|---|---|
| Duplicate path (409 `CONFLICT`) | Inline error inside `NewPageDialog`, same message key pattern as today's `CreatePageForm` (`page.create.error.pathExists`); dialog stays open so the user can fix the path and resubmit. |
| `FORBIDDEN`/`UNAUTHORIZED` | Inline error in the dialog, matching current handling. |
| Invalid title/path (client-side) | zod resolver + inline field errors via react-hook-form, same pattern as today; submit is blocked until valid. |
| Empty content on create | `renderMarkdown('')` runs the same as any other content — no special-casing needed; produces an empty (but valid) HTML string. |
| Redirect-then-load race | None: `pageService.create()` runs in a single Postgres transaction and returns after commit; the subsequent `/edit/{path}` server-side load is read-after-write consistent. |
| Permission denied reaching `/new` | Unchanged — existing server-side gating on the route is untouched. |
| Batch-create with omitted content | Now allowed (each item reuses `publicPageCreateInputSchema`); flagged under testing below to confirm no existing test asserts the opposite. |

## Testing plan

- **Shared package unit test** (`packages/shared/src/pages.test.ts` or
  wherever schema tests live): `publicPageCreateInputSchema` accepts a
  payload omitting `contentSource` (defaults to `''`) and one with
  `contentSource: ''` explicitly; existing non-empty case still passes
  unchanged (regression).
- **Service unit test** (`apps/web/src/server/services/pages.test.ts`):
  `pageService.create()` succeeds with `contentSource: ''`, and the
  created revision's `contentSource`/`contentHtml` reflect that (empty
  markdown renders to an empty/near-empty HTML string, not an error).
- **Check existing batch-create tests** (search for
  `publicPageBatchCreateInputSchema` usage) for any assertion that empty
  content is rejected — none expected, but must confirm rather than
  assume, since the schema relaxation is shared.
- **E2e (Playwright)**, new coverage in a page/flow-appropriate spec:
  - `/new` shows the dialog immediately, with no editor visible behind
    it; submitting with empty title/path is blocked by inline validation.
  - Filling a valid title + path and submitting redirects to
    `/edit/{path}`; the loaded editor is the real `EditPageForm` (content
    can be typed and saved via the existing draft-save mechanism).
  - Creating a second page at a path that already exists shows the
    inline conflict error and keeps the dialog open.
  - Closing the dialog without submitting creates nothing and navigates
    away.
- **Update existing e2e**: `apps/web/e2e/flows.spec.ts`'s
  `fillProperties`/`savePage` helpers and the "editor drafts, publishes"
  test currently assume `/new` is a single-step form (properties +
  content + save all in one). These must be rewritten for the two-phase
  flow: fill the new-page dialog and submit (creates + redirects), *then*
  type content and save on the resulting edit page. The "role change is
  effective mid-session without re-login" test
  (`flows.spec.ts:110-133`) also visits `/new` after a role promotion and
  asserts a `Save` button and `.cm-content` become visible
  (`flows.spec.ts:128-130`) — under the new flow neither exists on `/new`
  at all (no editor is mounted there anymore), so this assertion must be
  replaced with a check that the new-page dialog (e.g. its title input)
  becomes visible instead, to confirm access was granted.
