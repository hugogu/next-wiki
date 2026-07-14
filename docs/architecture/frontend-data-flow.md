# Frontend Data Flow

**Status**: Constitutionally binding. Referenced by Core Principles P8 (Open
Standards Over Proprietary) and P9 (Explicit Over Implicit) in
`.specify/memory/constitution.md`.
**Change control**: These rules are NON-NEGOTIABLE. Violations are architecture
defects. A deviation requires a constitution amendment.

| Data type | Storage | Access pattern |
|-----------|---------|----------------|
| Server-rendered page data | React Server Components | Server service calls with permission context |
| Client server state (CRUD) | TanStack Query cache | `useQuery` / `useMutation` over REST route handlers (`fetch`) |
| Client UI state | Zustand | `useStore` |
| Form state | React Hook Form | `useForm` / `useController` |
| URL / filter state | Next.js search params | `searchParams` / `useSearchParams` |
| Auth session | Custom DB-backed session (cookie) | Server auth context / `useSession` |
| Job progress | TanStack Query polling or subscription adapter | Job status endpoint |
| Progressive search snapshots | TanStack Query cache | Idempotent POST polling keyed by search record and session |
| AI chat messages | Zustand (session-scoped) | `useChatStore`; NOT persisted to DB by default |
| AI streaming response | Local component state | SSE stream via `useChat` hook; tokens appended on arrival |

## Rules

Storing server-derived data in Zustand is PROHIBITED. TanStack Query is the
client server-state manager. Caching API responses in Zustand is an architecture
violation. If a client component needs server data, it calls the REST route
handlers through TanStack Query. If it needs shared UI state, it uses Zustand.
These concerns MUST NOT be mixed.

The Header search overlay's open/focus state, current input, debounce, and stale-request cancellation are transient local UI state. Its result snapshot, capability states, and progressive polling are server state and MUST use a TanStack Query mutation/query lifecycle keyed by the search record and overlay session. Aborting a browser request prevents stale UI updates; it does not cancel an already accepted server-side continuation, which remains resumable through the same idempotent POST resource.

Pagination state lives in the URL `page` search param, never in component
state. Every paginated list uses the shared `src/components/ui/Pagination`
primitive (links to `?page=N`, preserving other params) and the server-side
`src/server/api/pagination` helper (parse + clamp to `[1, totalPages]`, compute
offset). Holding the current page in `useState` is an architecture violation —
it breaks refresh, deep links, and back/forward.

React Server Components MAY fetch server data directly through service-layer
entry points, but they MUST construct and pass a permission context.
