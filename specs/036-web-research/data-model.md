# Data Model: Governed Web Research

## Existing entities extended

### AiSettings (singleton)

The initial connector is deployment-wide and belongs with existing encrypted AI
administration settings rather than model providers. Add these fields to the
singleton settings record:

| Field | Type / default | Purpose |
|---|---|---|
| webResearchEnabled | boolean, false | Global egress kill switch. |
| webResearchProvider | enum, nullable; tavily when configured | Static connector registry key; nullable means no configured service. |
| webResearchApiKeyEncrypted | nullable encrypted JSON/string | Write-only Tavily credential, encrypted with existing AI encryption. |
| webResearchAllowedDomains | text array, empty | Optional allow-list; empty means no inclusion restriction. |
| webResearchBlockedDomains | text array, empty | Exclusions take precedence over inclusions. |
| webResearchMaxSearchesPerTurn | integer, 2 | Valid range 1–5; connector-call budget. |
| webResearchMaxCandidatesPerSearch | integer, 5 | Valid range 1–10; result and UI bound. |
| webResearchMaxOpenedSourcesPerTurn | integer, 3 | Valid range 1–5; extraction and evidence bound. |
| webResearchMaxSourceChars | integer, 16000 | Valid range 1,000–64,000; post-extract content cap. |
| webResearchTimeoutMs | integer, 10000 | Valid range 1,000–60,000; per connector call timeout. |
| webResearchLastTestAt / webResearchLastTestStatus | nullable timestamp/status | Safe operational indication; never store request body or credential. |

The public admin view exposes whether a credential exists, provider name,
policy, limits, and last test status. It never returns the credential. The
patch contract accepts a replacement key only and treats blank as unchanged;
a separate explicit clear operation is required if product policy permits it.

### UserAiEntitlement

Add webResearchEnabled, default false for non-admin users and true for the
default administrator only when the existing AI-question entitlement model would
otherwise permit them. It is independent of ordinary page-read permissions.
A web request also requires a signed-in session actor and the established
question-answering entitlement; API-key, anonymous, MCP, bot, and scheduled
actors are rejected.

### AI action and conversation metadata

Keep existing questionMode values full and retrieval as the retrieval strategy.
Add ResearchMode in request/conversation metadata:

| Field | Allowed values | Meaning |
|---|---|---|
| researchMode | wiki_only, wiki_first_web | User-selected egress policy for the turn/session. |
| externalResearchConsent | true only when web mode | Records that the shown disclosure was confirmed before the action was queued. |

Add action features web_research_test and web_evidence_capture to the existing
explicit AI-action feature registry. Questions remain wiki_question actions.
Action events record only source status, safe usage, and citations; they do not
contain extracted page bodies or credentials.

## New entity: AiWebResearchAttempt

AiWebResearchAttempt is the privacy-safe operational history required to
operate the optional egress feature without retaining source material.

| Field | Type | Notes |
|---|---|---|
| id | UUID primary key | Audit record identity. |
| aiActionId | UUID nullable FK, set null on action deletion | Correlates while preserving an operational record after conversation deletion. |
| actorUserId | UUID nullable FK | Actor at time of attempt; apply existing privacy/deletion policy. |
| provider | enum/string | Connector key, initially tavily. |
| kind | enum | search, open, connection_test, capture. |
| outcome | enum/string | succeeded, denied, blocked, cancelled, timed_out, rate_limited, failed. |
| policyDisposition | enum/string | Effective decision without source body/query. |
| searchCount / openCount / sourceChars | integers | Bounded accounting values. |
| providerRequestId / latencyMs / creditsUsed | nullable safe telemetry | No credential or provider body. |
| createdAt | timestamp | Operational timeline. |

Index createdAt and aiActionId. The table stores no query text, URL, title,
snippet, extracted body, credential, cookie, page content, or user-provided
conversation context. Its retention follows the existing administrator-configured
safe audit retention; it is not a substitute for preserved Raw evidence.

## New entity: AiWebSource

AiWebSource is transient connector evidence associated with the AI action that
created it.

| Field | Type | Notes |
|---|---|---|
| id | UUID primary key | Opaque sourceId exposed only to the same action/tool loop. |
| aiActionId | UUID FK to ai_actions, cascade delete | Establishes ownership, permission scope, and cleanup origin. |
| originatingToolCallId | UUID nullable | Links an opened candidate to its read-only tool call for audit. |
| provider | enum/string | Connector key, initially tavily. |
| providerSourceId | nullable string | Provider-side opaque value only; never accepted from client as authorization. |
| canonicalUrl | text | Normalized permitted public http/https final address. |
| title | text | Search result title; sanitized and bounded. |
| snippet | text nullable | Bounded, untrusted search snippet. |
| relevanceScore | numeric nullable | Ranking hint only, never a truth signal. |
| publishedAt | timestamp nullable | Present only when provider supplied a reliable value. |
| retrievedAt | timestamp nullable | Search or extract time. |
| contentEncrypted | bytea/text nullable | Bounded opened Markdown only; encrypted at rest. |
| contentHash | text nullable | Local SHA-256 of the exact retained content. |
| status | enum | candidate, opened, failed, captured, expired. |
| failureCode | nullable stable code | No provider body or secret. |
| providerRequestId | nullable string | Support/audit correlation; not user-visible. |
| expiresAt | timestamp | At most 24 hours after retrieval; indexed for cleanup. |
| capturedRawPageId | UUID nullable | Durable Raw source after explicit successful capture. |
| capturedRawRevisionId | UUID nullable | Exact durable evidence revision. |
| capturedAt / capturedBy | nullable | User-initiated capture audit. |
| createdAt / updatedAt | timestamps | Standard lifecycle fields. |

Indexes: aiActionId; expiresAt; aiActionId plus canonicalUrl or source identity
for deduplication; capturedRawPageId where supported. The primary source ID is
scoped by action access even if UUIDs are unguessable.

### AiWebSource state transitions

~~~text
candidate --web_open succeeds--> opened --capture succeeds--> captured
candidate --open/filter/error--> failed
candidate/opened/failed --expiry cleanup--> expired then delete
candidate/opened --action deletion--> delete (unless capture already wrote Raw)
~~~

A capture request is idempotent: a source already in captured state returns its
existing Raw evidence action/result. Expired, failed, filtered, unowned, or
body-less sources cannot be captured. Cleanup deletes unpreserved source data
and can delete captured metadata after its short operational retention; it
never deletes the independent Raw source/revision.

## Derived contracts, not durable source-of-truth tables

### WebResearchPolicy

Resolved per external call from AiSettings, user entitlement, current action,
and cancellation status:

- global switch and configured connector;
- signed-in actor and web-research entitlement;
- domain exclusion before inclusion;
- remaining search/open/source-character/time budget;
- action ownership, source status, and non-expiry for web_open/capture.

It is deliberately computed, not copied as a long-lived policy snapshot. A safe
policy disposition may be written in action metadata for audits.

### WebCitation

WebCitation is serialized in answer/result metadata but has no independent
database table. Its render-safe form is:

| Field | Requirement |
|---|---|
| kind | web |
| sourceId | The source record identity at generation time. |
| canonicalUrl | Original external link for the reader. |
| title | Bounded source label. |
| provider | Connector identity. |
| retrievedAt | Time evidence was obtained. |
| publishedAt | Optional provider-supplied publication time. |
| contentHash | Optional hash of opened retained content. |

WikiCitation remains revision-based. Readers interpret historical citations with
no kind as WikiCitation, preserving existing conversation and Raw transcript
data.

## Capture mapping to Raw original evidence

The web_evidence_capture action reads one owned AiWebSource, decrypts the
bounded body in its worker, and writes an existing Raw page/revision using input
kind external-fetch. Its source metadata includes the canonical URL, title,
provider, retrieval time, action ID/session identifier, and content hash. The
trusted writer can retain those extra fields even though the generic public
raw-source schema is narrower. The resulting Raw page and revision IDs are
written back to AiWebSource and made available to the answer UI.

The Raw page is the durable evidence. It is neither a Wiki page edit nor a
publication, and no embedding/index write happens merely because it was
captured. Any normal existing Raw indexing lifecycle remains authoritative.

## Migration and retention rules

1. Update Drizzle schema files and shared enum/schema tests.
2. Run pnpm db:generate to create the SQL migration and matching snapshot.
3. Inspect the generated migration, apply it in the normal test database, then
   rerun pnpm db:generate and confirm it reports no schema changes.
4. Extend the existing AI cleanup job (which already runs periodically) to
   purge expired unpreserved AiWebSource content/metadata and redact any safe
   operational attempt data according to configured retention.
5. Never hand-write migration SQL or the Drizzle journal/snapshot.
