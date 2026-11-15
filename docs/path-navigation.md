# Path-scoped navigation

User Settings → Navigation mode offers **Page tree** (the existing default) and
**Current directory**. The selection belongs to the account and persists across
sessions. Current directory shows the current page's direct children. Leaf pages
show an empty state and a parent-directory link. Breadcrumbs at the top of reader
pages provide another way to return to any ancestor or the Wiki root.

Page links use canonical slugs, while directory browsing under
`/pages/browse/{space}/{path}` uses organizational paths. Virtual folders are
navigable even when no page exists at that path. The built-in default space is
labelled **Wiki**, rather than its internal name **Default**.

## Data and caching

- `/api/v1/navigation?path=guides&mode=current` returns one level with
  `hasChildren` flags. `mode=tree` returns the root and current ancestor levels.
  Permission filtering happens before PostgreSQL groups descendants into direct
  child paths. Revision bodies and descendant metadata are not loaded. Response
  size follows the visible levels, though PostgreSQL still examines matching
  paths to identify virtual folders and readable descendants.
- The original `/api/v1/tree` API keeps its full-tree contract. Sidebar branch
  expansion uses the new shallow API and retains loaded branches in component
  memory, including nested branches.
- Breadcrumbs query exact ancestor paths independently of the sidebar. They do
  not build a full tree.
- Only anonymous published navigation and breadcrumbs enter the shared server
  data cache (five minutes, existing `public-content` invalidation tag). Signed-in
  and API-key projections are permission-specific. All navigation API responses
  remain `private, no-store`; authenticated data never enters a shared HTTP cache.
- Directory and breadcrumb links use Next.js `Link` prefetching and the client
  Router Cache. Public reader documents retain their existing ISR behavior.
  Server caches retain the existing memory limit and disabled disk flush.
  See [Next.js linking and navigation](https://nextjs.org/docs/app/getting-started/linking-and-navigating).

The generated Drizzle migration adds `users.navigation_mode` with a `tree`
default. Deploy with the normal migration workflow.

## Verification

`page-navigation.test.ts` covers shallow payloads, permission parity with the full
tree, draft ownership, literal underscore prefixes, canonical ancestor slugs, and
response-size independence from an unrelated branch's growth. A 501-page fixture
compares full-tree and current-directory JSON sizes; it is a payload regression
check, not a page-load latency benchmark.

`path-navigation.spec.ts` covers the settings switch, fresh-session persistence,
virtual folders, canonical breadcrumb links, browser back/refresh, mobile layout,
and switching back to the page tree. `Navigator.lazy.test.tsx` verifies that
nested shallow branches are fetched only once when collapsed and reopened.
