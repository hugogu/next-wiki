# Frontend Data Flow

**Status**: Constitutionally binding. Referenced by Core Principles P8 (Open
Standards Over Proprietary) and P9 (Explicit Over Implicit) in
`.specify/memory/constitution.md`.
**Change control**: These rules are NON-NEGOTIABLE. Violations are architecture
defects. A deviation requires a constitution amendment.

| Data type | Storage | Access pattern |
|-----------|---------|----------------|
| Server-rendered page data | React Server Components | Server service calls with permission context |
| Client server state (CRUD) | TanStack Query cache | `useQuery` / `useMutation` via tRPC |
| Client UI state | Zustand | `useStore` |
| Form state | React Hook Form | `useForm` / `useController` |
| URL / filter state | Next.js search params | `searchParams` / `useSearchParams` |
| Auth session | Better Auth session | Server auth context / `useSession` |
| Job progress | TanStack Query polling or subscription adapter | Job status endpoint |
| AI chat messages | Zustand (session-scoped) | `useChatStore`; NOT persisted to DB by default |
| AI streaming response | Local component state | SSE stream via `useChat` hook; tokens appended on arrival |

## Rules

Storing server-derived data in Zustand is PROHIBITED. TanStack Query is the
client server-state manager. Caching API responses in Zustand is an architecture
violation. If a client component needs server data, it uses tRPC through
TanStack Query. If it needs shared UI state, it uses Zustand. These concerns
MUST NOT be mixed.

React Server Components MAY fetch server data directly through service-layer
entry points, but they MUST construct and pass a permission context. Client
Components MUST NOT import server services.
