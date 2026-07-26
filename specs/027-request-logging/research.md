# Research: Outbound Request Logging

## R1 — Capture at the explicit provider HTTP boundary

**Decision**: Implement a reusable `withOutboundRequestLog` contract in the web
server and use it from the existing AI provider request boundary. Its source
type and operation are validated against one immutable service-owned registry;
future sources are added by code change, never runtime discovery. Refactor the
provider adapter operations so the wrapper observes the complete operation, not
only the initial `fetch`, including response parsing and streaming failures.

**Rationale**: Every current AI provider operation already passes through
`apps/web/src/server/ai/providers/http-client.ts`. Capturing there covers model
discovery, provider tests, chat, embeddings, and image generation without
vendor-specific code. Observing the complete operation is necessary because an
HTTP 200 response can still fail later due to malformed JSON, malformed SSE, an
empty stream, cancellation, or a wrong response shape.

**Alternatives considered**:

- Intercept every global `fetch`: rejected because it would capture browser and
  internal requests unintentionally, make source identity implicit, and risk
  recursive logging.
- Add logging separately to every provider adapter without a shared wrapper:
  rejected because it duplicates level semantics and makes future integrations
  inconsistent.
- Capture only `providerFetch` status codes: rejected because parser and stream
  errors are part of the failure the operator needs to diagnose.
- Let integrations register source names dynamically: rejected by P10 because
  the supported source surface would no longer have one traceable entry point.

## R2 — One generic table plus one singleton settings row

**Decision**: Add one `outbound_request_logs` table for all source types and one
`request_log_settings` singleton for the global switch, level, and retention.
Do not add AI-specific request tables or provider-specific columns.

**Rationale**: The request log is an operational collection, not an extension of
`ai_actions`. A generic source/provider/operation identity lets AI and future
integrations share the same list and detail view. The settings row is separate
because it is mutable global policy rather than one request attempt.

**Alternatives considered**:

- Reuse `api_audit_entries`: rejected because that table intentionally stores
  bounded request metadata and cannot hold full response bodies or headers.
- Store request details in `ai_actions`: rejected because non-AI requests have
  no AI action and one AI action may produce multiple provider attempts.
- Create a table per provider: rejected because it violates the generic
  mechanism requirement and multiplies retention/query/UI code.

## R3 — Capture levels are fixed and recorded per attempt

**Decision**: Use a switch independent from a fixed level enum: `Status`,
`Header`, and `All`. Snapshot the selected level into every record.

**Rationale**: The level must not change the interpretation of old records when
the Admin later changes the global setting. `Status` is safe metadata plus a
normalized error summary; `Header` adds every request/response header as an
ordered list of name/value pairs; `All` adds complete available body bytes and
complete serializable error details.

**Alternatives considered**:

- A free-form list of fields: rejected because operators need predictable
  semantics and the UI/tests need a stable contract.
- Always capture full bodies and redact at display time: rejected because it
  creates unnecessary sensitive storage while capture is meant to be temporary.
- A separate switch per provider: rejected for the first delivery because the
  user requested one reusable troubleshooting switch and level.

## R4 — Encrypt sensitive raw fields at rest

**Decision**: Store raw target, header arrays, body envelopes, and full error
detail in encrypted columns using the existing AES-256-GCM key-encryption
utility. Keep only bounded, non-secret metadata in list/filter columns.

**Rationale**: `Header` and `All` can contain API keys, cookies, prompts,
documents, and provider responses. Existing key encryption provides a project
approved encryption path without adding a service or dependency. The Admin
detail service decrypts only after the current Admin permission check; list
responses never contain raw values.

**Alternatives considered**:

- Store raw JSON/text directly in PostgreSQL: rejected because a database dump
  would expose the very credentials and user content the UI boundary protects.
- Reuse `aiActionInputs` for bodies: rejected because request logs are generic,
  have different retention, and need per-attempt request/response fields.
- Add object storage encryption: rejected because it adds a default deployment
  dependency and complicates one-table lookup/detail behavior.

## R5 — Preserve bytes and duplicate headers without lossy normalization

**Decision**: Represent headers as an ordered array of `{name, values}` entries
and body/error data as encrypted envelopes carrying encoding, content type,
content encoding, byte length, and the original UTF-8 or base64 content.

**Rationale**: A plain object loses duplicate header names and multi-valued
headers. A byte-preserving envelope lets the Admin inspect JSON/text while also
identifying binary, compressed, malformed, or empty content correctly.

**Alternatives considered**:

- Convert headers to a `Record<string, string>`: rejected because it violates
  the complete-header requirement.
- Store only parsed JSON: rejected because malformed and non-JSON responses are
  exactly the cases being diagnosed.
- Store only a text preview: rejected for `All`, which explicitly promises
  complete available content.

## R6 — Tee streaming responses and finalize after the consumer operation

**Decision**: The provider wrapper duplicates the response stream for the
adapter consumer and the capture collector. The collector records the full
available bytes for `All` without consuming the adapter's branch. The wrapper
finalizes the record in a `finally` path after parsing/streaming completes or
fails.

**Rationale**: Reading the response body inside the logger would make the
provider adapter see an empty body. A duplicated stream preserves normal
behavior and allows malformed-stream/parser errors to be associated with the
same request attempt. Existing provider safety limits remain in force; content
that the transport refuses or cancels is marked unavailable with the failure
details that exist.

**Alternatives considered**:

- `Response.clone()` with an unbounded background reader: rejected because
  stream backpressure and cancellation behavior are less explicit.
- Buffer the response before returning it: rejected because it changes latency
  and memory behavior for streaming chat.
- Log only response headers for streams: rejected because the requested `All`
  level must diagnose provider response content and stream failures.

## R7 — Best-effort persistence with no recursive outbound logging

**Decision**: The request logger encrypts detail envelopes before submitting an
idempotent `requestLogPersist` job to the existing pg-boss worker process; it
never persists through an HTTP endpoint. The original outbound operation does
not await queueing or persistence. Queue/persistence failures are caught,
emitted as a bounded application diagnostic, and cannot change the provider
operation's result or trigger another request-log record.

**Rationale**: Logging must remain an observability aid, not a new failure mode.
The local database and pg-boss worker are already part of the default
deployment. Encrypting before queueing keeps raw diagnostic content out of the
job payload in plaintext, while an assigned request-log ID makes worker retries
safe. Keeping the write path local also avoids a recursive request-capture loop.

**Alternatives considered**:

- Send records to a remote logging service: rejected by P1 and because it would
  itself be an outbound request to capture.
- Await persistence from the provider operation: rejected because it can delay
  completion and violates the async-first requirement.
- Throw when persistence fails: rejected because the spec requires the original
  request to retain its normal result.
- Write raw payloads to process stdout: rejected because normal application logs
  redact secrets and are not an authenticated searchable record store.

## R8 — Add a dedicated Admin permission action and reuse API audit

**Decision**: Add `manage_request_logs` to the server permission chokepoint and
  a `request_logs` resource kind. Only session Admins pass it; no API-key scope
  maps to it. Wrap list/detail/settings routes with the existing API audit
  wrapper and add non-sensitive previous/new settings metadata for the PATCH
  transition.

**Rationale**: Reusing `manage_users` would give the feature the wrong semantic
  permission, while reusing `manage_storage` would be misleading. The existing
  API audit table already records authenticated route access, method, path,
  status, duration, and actor. Extending it with bounded setting-change metadata
  avoids a second access-event table while preserving the required before/after
  audit evidence.

**Alternatives considered**:

- Allow Admin API keys to read logs: rejected because raw headers/bodies are
  credential-bearing operational data and the feature spec explicitly excludes
  API keys.
- Use `manage_ai`: rejected because non-AI integrations must use the same log
  surface and request-log access is a separate operational concern.
- Create a second audit table: rejected because it duplicates existing audit
  infrastructure without improving the request-log record itself.

## R9 — Reuse the existing cleanup worker and bound retention

**Decision**: Default retention is 24 hours, configurable from 1 to 168 hours in
`request_log_settings`. Add expired-log deletion/expiry processing to the
existing scheduled `aiCleanup` worker rather than adding a new queue.

**Rationale**: Request capture is temporary troubleshooting data and can be
highly sensitive. A short default limits exposure and storage growth. The
existing worker runs independently of web requests and already owns other
time-based AI data cleanup, so it is an appropriate bounded background path
without increasing deployment footprint.

**Alternatives considered**:

- Retain records forever: rejected because full bodies and headers can contain
  secrets and large user content.
- Use a new cleanup queue: rejected because the existing scheduled worker is
  sufficient and a new queue adds operational complexity.
- Make retention environment-only: rejected because the operator needs to
  adjust the troubleshooting window from the same Admin surface.

## R10 — Admin page with URL-restorable list/detail contracts

**Decision**: Add `/admin/request-log` as one canonical Data & Operations nav
entry, with `/admin/request-log/[id]` for detail. Filters and pagination are
encoded in the list URL. Settings are shown on the list page and use the
existing Admin form/query primitives. The detail route renders a route-derived
breadcrumb as well as a back link to the current list URL.

**Rationale**: The existing Admin navigation already has a `Data & Operations`
group and URL-synced list patterns in `AdminAuditTable` and transfer pages. A
separate detail route preserves reading space and provides a clear back link
without putting raw payloads into a list preview.

**Alternatives considered**:

- Add a second tab inside the existing Access Log page: rejected because the
  access log and outbound request log have different data models, permissions,
  and detail sensitivity.
- Put full details in an expanding table row: rejected because large/binary
  payloads would consume reading space and make deep links difficult.
- Store filters only in component state: rejected because shared links and
  browser back/forward must restore the same result set.

## R11 — Keep APIs authenticated, dynamic, and documented

**Decision**: Add Admin-only JSON routes for settings, paginated list, and
detail. Use shared Zod schemas plus local OpenAPI scanner schemas, set routes to
dynamic/non-cached, and regenerate `apps/web/public/openapi.json` after route
annotations change.

**Rationale**: The project already uses thin route handlers, shared schemas,
`mapDomainError`, and next-open-api generation. The request-log routes are not a
public API-key surface, but documenting their shape keeps UI/service contracts
explicit and prevents accidental caching of sensitive responses.

**Alternatives considered**:

- Read the database directly from a client component: rejected because it
  bypasses permission and decryption boundaries.
- Put payloads in query parameters: rejected because URLs and browser history
  must never contain captured data.
- Use a cached server response: rejected by the project's no-cache API rule and
  because permissions and sensitive details are request-specific.
