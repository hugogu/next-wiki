# Feature Specification: Outbound Request Logging

**Feature Branch**: `027-request-logging`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "为 AI 和其它对外请求增加可开关、可分级的完整请求响应日志，并在 DATA & OPERATIONS 中提供 REQUEST LOG 标签页用于查看和排查问题"

## Summary

Provide one reusable outbound-request logging mechanism for AI provider calls and
other external requests made by the application. An Admin can turn capture on
only while troubleshooting and choose how much information is retained. The
captured records are available in a dedicated `REQUEST LOG` tab under `DATA &
OPERATIONS`, where an Admin can find the failing request and inspect its full
context.

The mechanism is provider- and request-type agnostic. AI requests are the first
required integration, but future outbound HTTP or SDK-backed integrations must
be able to use the same record shape, capture switch, detail level, search,
detail view, and permission boundary.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enable Diagnostic Capture (Priority: P1)

As an Admin, I want to enable outbound request capture and choose its detail
level, so that I can reproduce an AI or integration problem with enough evidence
to diagnose it and turn the potentially sensitive capture back off afterward.

**Why this priority**: Without a deliberate capture switch and level, the
operator cannot safely collect the information needed to investigate failures.

**Independent Test**: Open the request-log settings, verify capture is off by
default, enable it at each level, perform an AI request, and confirm that the
resulting record contains exactly the fields promised by the selected level.

**Acceptance Scenarios**:

1. **Given** request capture has never been configured, **When** an Admin opens
   the request-log settings, **Then** capture is shown as off and no new
   outbound request record is created for an AI call.
2. **Given** capture is off, **When** an Admin turns it on and selects
   `Status`, **Then** subsequent supported outbound requests create records
   containing request identity, timing, outcome, status information, and a
   diagnostic error summary when available, but no request/response headers or
   bodies.
3. **Given** capture is on, **When** an Admin changes the level to `Header`,
   **Then** subsequent records include every request and response header name
   and value in addition to the `Status` fields.
4. **Given** capture is on, **When** an Admin changes the level to `All`,
   **Then** subsequent records include every request and response header,
   complete request and response content when available, and complete
   serializable error details when a request fails.
5. **Given** an Admin enables `All`, **When** the setting is saved, **Then** the
   UI warns that request content and credentials may be captured and requires
   an explicit confirmation before activation.
6. **Given** capture is on, **When** an Admin turns it off, **Then** new
   supported outbound requests stop creating records while previously captured
   records remain available according to the retention policy.

### User Story 2 - Find and Diagnose a Request (Priority: P1)

As an Admin, I want to inspect request records in a dedicated `REQUEST LOG` tab
under `DATA & OPERATIONS`, so that I can identify the failing call and understand
what the application sent, what it received, and why it failed.

**Why this priority**: Captured data is only useful if an operator can quickly
find the relevant request and inspect it without server access.

**Independent Test**: Generate successful, failed, and timeout AI calls, open
`DATA & OPERATIONS` → `REQUEST LOG`, filter by source and outcome, open one
record, and verify the list and detail view expose the captured information at
the configured level.

**Acceptance Scenarios**:

1. **Given** an Admin opens `DATA & OPERATIONS`, **When** they select the
   `REQUEST LOG` tab, **Then** the system shows a paginated list of captured
   outbound requests ordered from newest to oldest.
2. **Given** request records exist, **When** an Admin filters by time range,
   source type, provider/integration, operation, outcome, status code, or
   correlation identifier, **Then** only matching records are shown and the
   active filters are clear.
3. **Given** a request record is shown in the list, **When** an Admin opens it,
   **Then** the detail view shows its timestamp, source, operation, target,
   correlation identifier, duration, outcome, status, and captured error
   information, plus the headers and content allowed by its capture level.
4. **Given** an outbound request failed before receiving a response, **When**
   an Admin opens its record, **Then** the record clearly distinguishes missing
   response data from an empty response and shows the available failure details.
5. **Given** no records match the active filters, **When** the Admin views the
   results, **Then** the UI explains that no matching request was captured and
   does not imply that no request was made while capture was off.
6. **Given** an Admin opens a request record while capture is off, **When** they
   inspect it, **Then** the record remains readable and the settings state is
   visible so the Admin knows when it was captured and at which level.

### User Story 3 - Capture AI and Future External Requests Through One Mechanism (Priority: P1)

As a system maintainer, I want AI provider calls and other supported external
requests to use the same logging mechanism, so that troubleshooting behavior is
consistent and a new integration does not require a separate log surface.

**Why this priority**: The user needs to diagnose the current AI problem, but
the requested value is a reusable operational capability rather than an
AI-specific workaround.

**Independent Test**: Execute an AI provider request and a second supported
external integration request with the same capture setting. Confirm both appear
in `REQUEST LOG` with the same common fields, while each retains its source,
provider, and operation identity.

**Acceptance Scenarios**:

1. **Given** capture is enabled, **When** the application sends an AI provider
   request, **Then** the call is recorded with source type, provider, operation,
   request/response outcome, and the selected detail level.
2. **Given** capture is enabled, **When** another registered external
   integration sends a request, **Then** it is recorded in the same request-log
   collection and can be filtered independently from AI requests.
3. **Given** multiple outbound requests occur during one user action, **When**
   an Admin opens the resulting records, **Then** the records share a
   correlation identifier where the application has one and can be ordered by
   start time to reconstruct the interaction.
4. **Given** a future integration adopts the outbound-request logging contract,
   **When** it sends a request while capture is enabled, **Then** it requires no
   new request-log tab, filter model, or detail-view concept to become visible.

### User Story 4 - Protect and Control Captured Operational Data (Priority: P1)

As an Admin, I want request capture and captured data to have a clear security
boundary, so that diagnostic logging does not silently expose external-service
credentials or user data to unauthorized users.

**Why this priority**: `Header` and `All` may contain authorization values,
cookies, prompts, document content, or provider responses. The diagnostic value
must not remove the application's permission boundary.

**Independent Test**: Enable `All`, create a record containing sensitive
request data, attempt to access the settings, list, detail, and raw captured
fields as a non-Admin and through an unauthorized integration credential, then
verify all access is denied without revealing the record.

**Acceptance Scenarios**:

1. **Given** a non-Admin user or anonymous visitor requests the request-log
   settings, list, detail, or captured payload, **When** authorization is
   evaluated, **Then** access is denied and no record metadata or captured value
   is disclosed.
2. **Given** an Admin changes the capture switch or level, **When** the change
   is saved, **Then** the change is attributed to that Admin and the effective
   setting is visible in the request-log settings.
3. **Given** a captured record contains credentials or other sensitive values,
   **When** it is displayed in the Admin UI, **Then** the UI identifies the
   sensitive nature of the data and does not place it in browser URLs, list
   previews, notifications, or ordinary application logs.
4. **Given** captured records reach their configured retention deadline, **When**
   retention processing runs, **Then** the records are no longer available in
   normal request-log searches and the retention behavior is visible to the
   Admin.

### Edge Cases

- A request succeeds with a non-success status code: the record preserves the
  actual status and classifies the outcome without treating transport success
  as application success.
- A request fails before a response exists: request headers and available
  transport/error details are recorded according to the level, while response
  fields are explicitly marked unavailable.
- A request times out, is cancelled, is retried, or fails during streaming:
  each attempt is distinguishable, and the final user-visible operation can be
  correlated with its attempts.
- An outbound response is binary, compressed, malformed, or not safely
  representable as text: `Status` and `Header` remain usable; `All` records the
  complete content in a form the detail view can identify and inspect without
  corrupting it.
- A request has duplicate header names or multiple values for one header: all
  names and values are retained rather than silently keeping only one value.
- A request has no response headers or an empty body: the detail view
  distinguishes absent data from present-but-empty data.
- A request is made while capture is disabled: no partial record is created,
  and the UI does not claim that the request was captured.
- Capture is toggled while requests are in flight: each record uses one clear
  capture decision and level, and a request is not silently split between
  levels.
- An Admin changes the level while many requests are active: already-created
  records retain their original level; later records use the new level.
- A provider returns an error payload containing secrets or a very large body:
  access remains Admin-only and the record remains associated with its source
  and correlation identifier.
- The logging path itself fails: the original outbound request continues with
  its normal success/failure behavior, and the logging failure is surfaced to
  operational diagnostics without recursively creating request-log records.
- There are no captured records: the `REQUEST LOG` tab shows an empty state
  with the current capture switch and level, rather than a server error.
- A user loses Admin permission after a record was captured: subsequent access
  to the settings and record contents is denied immediately under normal
  permission evaluation.

## Requirements *(mandatory)*

### Functional Requirements

#### Capture Settings

- **FR-001**: The system MUST provide one global outbound-request capture
  setting shared by AI provider calls and every registered external integration
  that adopts the logging contract.
- **FR-002**: Capture MUST be disabled by default and MUST be controllable by
  an Admin through the `DATA & OPERATIONS` request-log settings surface.
- **FR-003**: The system MUST provide the detail levels `Status`, `Header`, and
  `All`, and MUST apply the selected level to each newly captured request.
- **FR-004**: `Status` MUST record the request identity and lifecycle metadata,
  including source type, provider/integration, operation, target, timestamp,
  duration, correlation identifier when available, outcome, status code when
  available, and a diagnostic error summary when available; it MUST NOT record
  request or response headers or bodies.
- **FR-005**: `Header` MUST include all `Status` fields plus every request and
  response header name and value, including duplicate names and multiple values.
- **FR-006**: `All` MUST include all `Header` fields plus complete request and
  response content when available and all complete serializable error details
  available from the transport or external provider, including provider error
  payloads when returned.
- **FR-007**: The system MUST persist the capture level used for each record so
  that later inspection never depends on the current global setting.
- **FR-008**: The system MUST warn and require explicit confirmation before an
  Admin enables `All`, because captured data may include credentials, prompts,
  personal data, or external-service content.
- **FR-009**: Turning capture off MUST prevent new request-log records while
  preserving existing records until the configured retention deadline.

#### Common Outbound Request Contract

- **FR-010**: The system MUST expose one bounded, explicit contract for
  recording supported outbound requests, independent of AI provider or
  integration vendor.
- **FR-011**: Every record MUST identify its source type, provider or
  integration, operation, target, request attempt, and correlation identifier
  when one exists, so records from different external systems can be searched
  and reconstructed consistently.
- **FR-012**: AI provider requests MUST use this common contract for model,
  embedding, image, and other supported provider operations rather than a
  separate AI-only logging path.
- **FR-013**: A registered non-AI external integration MUST be able to use the
  same contract and appear in the same request-log surface without introducing
  a new log record shape or viewer.
- **FR-014**: Recording MUST cover successful responses, non-success responses,
  transport failures, timeouts, cancellations, retries, and failures that occur
  before a response is received.
- **FR-015**: A failure in request logging MUST NOT change the success, failure,
  timeout, or cancellation result of the original outbound request, and the
  logging path MUST NOT recursively record its own outbound activity.

#### Request Log Surface

- **FR-016**: The system MUST provide a standalone `REQUEST LOG` tab under
  `DATA & OPERATIONS` for viewing captured outbound request records.
- **FR-017**: The request-log list MUST be paginated, ordered newest first by
  default, and show enough summary information to distinguish source,
  operation, outcome, status, duration, and capture level.
- **FR-018**: The request-log surface MUST support filtering by time range,
  source type, provider/integration, operation, outcome, status code, and
  correlation identifier.
- **FR-019**: The request-log detail view MUST show all captured fields allowed
  by the record's level and MUST clearly distinguish unavailable, empty, and
  omitted fields.
- **FR-020**: The request-log surface MUST show the current capture switch and
  level, provide a direct path to change them, and make it clear when no
  records exist because capture was disabled.
- **FR-021**: Request-log settings and records MUST be a single canonical
  operations surface; AI provider pages and individual integration pages MUST
  not create competing request-log viewers.

#### Permissions, Audit, and Retention

- **FR-022**: Only an Admin MUST be able to view or change request-log settings,
  list records, open details, or access captured headers, content, and error
  data; anonymous users, Editors, ordinary users, and API keys MUST be denied.
- **FR-023**: Changes to the capture switch and level MUST be audited with the
  acting Admin, time, previous value, and new value.
- **FR-024**: Access to request-log records MUST respect current permissions;
  losing Admin access MUST prevent further access without requiring a restart.
- **FR-025**: Captured records MUST have a bounded, configurable retention
  period, with a documented default suitable for temporary troubleshooting, and
  expired records MUST be excluded from normal searches after retention
  processing.
- **FR-026**: The Admin UI MUST NOT expose captured headers, bodies, or error
  payloads through URLs, list previews, browser notifications, or unrelated
  application logs.
- **FR-027**: The system MUST make it clear in the request-log surface that
  `Header` and `All` may contain secrets and external-service data, and MUST
  show the capture level and capture time for every record.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- This feature does not change anonymously readable published content, public
  metadata, or public navigation. The authenticated `DATA & OPERATIONS` surface,
  request records, settings, and captured payloads MUST NOT be included in any
  anonymous cached document.

### Key Entities *(include if feature involves data)*

- **Outbound Request Record**: One captured attempt to communicate with an
  external provider or integration. It contains common request identity,
  timing, outcome, correlation, capture-level metadata, and the level-dependent
  headers, content, and error details.
- **Outbound Request Source**: The registered source type, provider or
  integration, and operation that produced a request record. It lets AI and
  future integrations share the same logging contract while remaining
  independently filterable.
- **Request Capture Settings**: The global enabled/disabled state, selected
  detail level, retention policy, and last change attribution governing new
  outbound request records.
- **Request Log Access Event**: An audit record for changing capture settings
  or accessing sensitive request-log data, including actor and time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With capture disabled, 100% of acceptance-test AI and supported
  integration requests create no request-log record.
- **SC-002**: With capture enabled, 100% of acceptance-test AI requests create
  one distinguishable record per request attempt, including failed, timed-out,
  cancelled, and non-success responses.
- **SC-003**: In level-conformance tests, 100% of `Status` records contain no
  headers or bodies, 100% of `Header` records contain every request and response
  header value, and 100% of `All` records contain the complete available
  request/response content and serializable error details.
- **SC-004**: An Admin can enable capture, select a level, reproduce a failing
  AI call, find it in `REQUEST LOG`, and open its detail in under 2 minutes
  during usability testing.
- **SC-005**: For a test set of at least 1,000 captured records, an Admin can
  filter by source, outcome, status, time range, and correlation identifier and
  receive the matching first page within 2 seconds under normal operating
  conditions.
- **SC-006**: In permission tests, 100% of non-Admin attempts to access
  request-log settings, metadata, headers, bodies, or errors are denied without
  disclosing whether a matching record exists.
- **SC-007**: In a two-source integration test, AI and non-AI requests appear in
  the same request-log tab, share the common fields, and remain independently
  filterable without feature-specific viewer changes.
- **SC-008**: In fault-injection tests where request logging fails, 100% of
  original outbound requests retain their original result and no recursive
  request-log failure loop occurs.
- **SC-009**: In retention tests, 100% of records older than the configured
  retention period are excluded from normal request-log searches after the
  retention process completes.

## Assumptions

- The first delivery instruments AI provider calls, including model and other
  configured AI capabilities that make outbound requests; existing and future
  non-AI integrations opt in through the same explicit contract.
- The global switch and level apply to all supported outbound request sources;
  per-provider overrides are out of scope for the first delivery.
- `All` means complete content and complete available error data, not merely a
  shortened preview. The UI and permission boundary must make its sensitivity
  explicit.
- Request-log access is an Admin-only operational capability. It is not exposed
  to Editors, ordinary users, anonymous visitors, or API-key clients.
- Captured data is intended for temporary troubleshooting. The default
  retention period will be selected during planning from the project's existing
  operational-retention conventions and must be configurable within the
  bounded policy in this specification.
- The system records the information available at the outbound-request
  boundary; if a provider or transport never exposes a field, the record marks
  it unavailable rather than inventing a value.
- The request-log tab is authenticated and operational; it does not alter the
  public reader, public navigation, or anonymous cache behavior.
