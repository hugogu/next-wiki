# Contract: Unified Pagination Component

Not a REST endpoint — a shared UI primitive plus a server-side query convention.
Component: `src/components/ui/Pagination.tsx`. Used by every paginated list
(FR-019). Driven entirely by the URL `page` search param (R9, P10, Frontend Data
Flow mandate).

## Component API

```ts
interface PaginationProps {
  currentPage: number;     // 1-based, already clamped by the server
  totalPages: number;      // computed from totalItems / pageSize
  pageParam?: string;      // default "page"
  // Renders <Link>/<a> to the same path with ?page=N, preserving other params.
}
```

Rendering rules:
- Shows **First**, **Previous**, nearby page numbers, **Next**, **Last**
  (FR-020).
- First/Previous disabled (non-link, `aria-disabled="true"`) on page 1;
  Next/Last disabled on the last page (FR-022).
- Renders nothing (or fully disabled) when `totalPages <= 1` or list empty
  (FR-024).
- Each link preserves all other existing query params (filters, tab, q, …).

## Server-side convention

For any list route/handler:

1. Read `page` from `searchParams` (string).
2. Parse + **clamp** to `[1, totalPages]`; non-numeric/zero/negative → 1; beyond
   last → `totalPages` (FR-023). Never error.
3. `offset = (page - 1) * pageSize`; query with `limit`/`offset`.
4. Pass `currentPage` + `totalPages` to `<Pagination>`.

The page number is thus always in the URL → refresh, deep link, bookmark,
share, and browser back/forward all return to the same page (FR-021, SC-005).

## Migration of existing lists

Replace ad-hoc/limit-offset-without-URL implementations (e.g. transfers list at
`limit:20, offset:0`, search, history, admin lists) with this component +
convention. No list keeps its own pagination UI (FR-019, anti-pattern: duplicate
entry points).

## Test scenarios

1. List with > pageSize items → control shows First/Prev/Next/Last + numbers.
2. Click Last → URL becomes `?page=<totalPages>`; refresh stays on that page
   (FR-021).
3. On page 1 → First/Prev disabled; on last page → Next/Last disabled (FR-022).
4. Open `?page=0`, `?page=-3`, `?page=abc`, `?page=99999` → clamped, no error
   (FR-023).
5. Single-page list → control hidden/disabled (FR-024).
6. Two different lists → same component, identical behavior (FR-019, SC-005).
7. List with active filter `?q=foo&page=2` → paging preserves `q`.
