# Feature Specification: Feishu Bot Integration

**Feature Branch**: `019-feishu-bot`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description — Add a Feishu bot entry that (a) lets Feishu users ask the wiki questions and get AI-grounded answers, and (b) pushes notable wiki events to Feishu chats. Feishu identities are bound to existing wiki user accounts. The integration is an explicitly registered module inside the single wiki web application (no separate process); inbound messages resolve the active binding in-process and reuse the wiki's existing permission, AI-question, and audit services so every bot action is attributed to the bound user and passes the normal permission chokepoint.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bind a Feishu Identity to a Wiki Account (Priority: P1)

A user opens a Feishu chat with the wiki bot for the first time (1:1 or by @-mentioning the bot in a group). The bot detects that no binding exists for this Feishu identity and replies in private chat with a one-time binding link. The user clicks the link, signs in to the wiki with their own credentials, and confirms the binding. From that point on, every message coming from this Feishu identity is recognized as the bound wiki user, with all the permissions and personalization that user has.

**Why this priority**: Without binding, the bot cannot attribute questions to a wiki identity, cannot apply read permissions, and cannot personalize answers or notifications. Binding is the gateway to every other feature in this spec.

**Independent Test**: A brand-new Feishu user can complete binding and receive a confirmation message that addresses them by their wiki display name. Implemented alone, this story already delivers tangible value: the operator can see who has connected, and the binding record becomes the foundation for any later bot capability.

**Acceptance Scenarios**:

1. **Given** an unbound Feishu user sends any message to the bot, **When** the bot receives it, **Then** the user gets a private message with a binding link, and the bot declines to answer content questions until binding completes.
2. **Given** an unbound Feishu user opens the binding link and signs in to the wiki, **When** the wiki confirms the binding, **Then** the bot sends a welcome message addressing the user by their wiki display name and unlocks Q&A features.
3. **Given** a bound Feishu user invokes the unbind command, **When** the command is processed, **Then** the binding is revoked and subsequent messages from that identity are treated as unbound.
4. **Given** a wiki admin revokes a binding from the admin panel, **When** the corresponding Feishu identity next contacts the bot, **Then** it is treated as unbound and offered a fresh binding link.

---

### User Story 2 - Ask Wiki Questions in Feishu (Priority: P1)

A bound user sends a direct message to the bot, or @-mentions it in a Feishu group, and asks a question in natural language. The bot searches the wiki using its existing AI retrieval, generates an answer grounded in published pages the user can read, and replies with the answer plus source links (Feishu rich cards linking back to the wiki are preferred when available).

**Why this priority**: This is the primary value of the integration — bringing the wiki's existing AI capabilities to where users already collaborate, without making them switch tools.

**Independent Test**: A bound user can ask a question, receive a grounded answer within a reasonable wait time, and click a source link that opens the underlying wiki page. Implemented alone (after Story 1), this story is already a usable MVP.

**Acceptance Scenarios**:

1. **Given** a bound user sends the bot a direct question or @-mentions it in a group, **When** relevant published pages exist that the user has permission to read, **Then** the reply contains an answer and at least one source link to those pages.
2. **Given** a bound user asks a question whose only relevant material is on pages they lack permission to read, **When** the bot formulates a reply, **Then** it answers with a permission-aware fallback (or states that no accessible material was found) and never leaks content from disallowed pages.
3. **Given** a bound user asks a follow-up question in the same chat within the session window, **When** the bot answers, **Then** the answer takes prior turns in that user's chat session into account as conversational context without exposing another participant's context.
4. **Given** a bound user explicitly asks to start a new conversation (or the session window has elapsed), **When** the next question arrives, **Then** the bot treats it as a fresh session with no prior context.
5. **Given** AI capabilities are disabled at the wiki level, **When** a bound user asks a question, **Then** the bot replies with a clear "AI is not enabled" message rather than an error.

---

### User Story 3 - Receive Wiki Event Notifications (Priority: P2)

A bound user or a designated Feishu group receives notifications when notable wiki events occur: a page is published, a long-running AI action completes, or a content transfer/import/export finishes. Group delivery uses either a public-safe group card or permission-checked direct fan-out, so an event never discloses protected metadata to the group. Each eligible notification includes a deep link back to the relevant wiki page or admin view.

**Why this priority**: Notifications keep users informed about important wiki changes without leaving Feishu, which increases engagement with the wiki over time. Important but not blocking for MVP.

**Independent Test**: When a subscribed event fires, an eligible Feishu card or direct notification arrives within the delivery window, and its deep link opens the correct wiki page or admin view; an ineligible group receives no event metadata.

**Acceptance Scenarios**:

1. **Given** an admin has subscribed a Feishu group to public-safe "page published" events for a specific space, **When** any editor publishes a publicly readable page in that space, **Then** the group chat receives a card with the page title and a deep link within the delivery window.
2. **Given** an admin has subscribed a bound user's direct Feishu chat to "AI action completed" events and that user triggers a long-running AI action in the web UI, **When** the action completes (success or failure), **Then** the user receives a Feishu card summarizing the result with a link back to the action.
3. **Given** an admin has subscribed a group in private-recipient mode to "transfer/import completed" events, **When** such a transfer finishes, **Then** each bound recipient who remains authorized receives a direct status card with a link to the transfer detail page, and no group summary reveals protected activity.
4. **Given** a notification cannot be delivered (chat deleted, bot removed, user deactivated), **When** repeated delivery attempts fail, **Then** the subscription is marked failing, paused, and surfaced to admins.

---

### User Story 4 - Admin Configures the Bot Connection and Subscriptions (Priority: P2)

An admin opens the wiki admin panel, enters the Feishu app credentials needed for the bot to connect, selects which events trigger notifications and to which chats, and reviews a list of bound Feishu identities. The admin can revoke any binding, pause any subscription, and inspect connection health.

**Why this priority**: Configuration must be self-service so the integration stays operable without code changes or vendor intervention.

**Independent Test**: An admin can save credentials, watch the bot connection status turn "online", subscribe a chat to an event, fire that event, and see the card arrive — all through the UI with no code changes.

**Acceptance Scenarios**:

1. **Given** the admin opens the Feishu integration settings page, **When** valid app credentials are saved, **Then** the bot connection status shows "online" within 60 seconds.
2. **Given** the admin opens the notification subscriptions page, **When** they add a direct-chat, public-safe group, or private-recipient group subscription for an event (optionally scoped to a space), **Then** subsequent eligible occurrences of that event are delivered according to its mode.
3. **Given** the admin opens the bound users list, **When** they revoke a binding, **Then** the corresponding Feishu identity is treated as unbound on next contact.
4. **Given** the admin opens the connection health view, **When** the bot has lost connection, **Then** the admin sees the current status, the last successful connection time, and the most recent error.

---

### Edge Cases

- **Outbound Feishu delivery is unavailable** (Feishu API unreachable, or the web app restarts mid-delivery): persist all outbound notifications as durable rows; retry with backoff and recover in-flight deliveries on restart; retain undelivered items for 72 hours by default; surface delivery health to admins. Inbound events are covered by Feishu's own at-least-once retry plus the durable inbox.
- **Bound wiki user is deactivated or revokes consent after binding**: treat the Feishu identity as unbound on next contact; terminate its active sessions; stop answering questions and sending personal notifications; the admin can formally revoke the binding.
- **Same Feishu identity bound on multiple wiki deployments**: each binding is scoped to a single wiki deployment; cross-deployment binding is out of scope for v1.
- **AI answer cannot be grounded in any accessible page**: bot replies that no accessible material was found and may prompt the user to refine the question.
- **Notification cannot be delivered** (chat deleted, bot removed): after five unsuccessful attempts, mark the subscription as failing, pause it, and alert admins.
- **Inbound message rate exceeds limits**: apply per-user and per-chat rate limits; surface overages to admins; never let one noisy chat starve others.
- **Inbound event is invalid, stale, or duplicated**: reject invalid or stale requests before processing; a duplicate must not create another binding, question, notification, or observable side effect.
- **The bot cannot privately message an unbound group participant**: do not post a binding link in the group; send only a generic instruction to start a direct bot chat, where the user can receive a private link.
- **Long-running answer**: the bot acknowledges the question within 3 seconds and pushes the final answer when ready, rather than holding the connection open beyond platform limits.
- **Group chat with multiple bound users**: the bot uses the @-mentioner's binding for both retrieval scope and audit attribution; other bound users in the chat do not widen the retrieval scope.
- **A subscribed group has no eligible recipients for a protected event**: do not post resource metadata to the group; record a blocked delivery and surface the subscription as requiring admin action.

## Requirements *(mandatory)*

### Functional Requirements

**Identity & Binding**

- **FR-001**: System MUST support a one-time binding flow that links a Feishu identity to an existing wiki user account.
- **FR-002**: System MUST verify that the user completing the binding is signed in to the wiki with their own credentials; the Feishu identity alone MUST NOT be trusted as authentication.
- **FR-003**: System MUST persist bindings with creation time, last-seen time, and revocation state, and MUST treat revoked or deactivated users as unbound on next contact.
- **FR-004**: System MUST allow a user to unbind their own Feishu identity, and an admin to revoke any binding.

**Inbound Messages & AI Q&A**

- **FR-005**: The bot MUST respond only to users with an active binding; unbound users MUST be offered the binding link instead of an answer.
- **FR-006**: For a bound user's question, the bot MUST perform permission-aware retrieval — only pages the bound wiki user can read may be used as source material.
- **FR-007**: Whenever accessible source pages exist, the bot's answer MUST include at least one source link to the underlying wiki page.
- **FR-008**: The bot MUST maintain conversational context per bound user within a single Feishu chat for a session window that defaults to 30 minutes of inactivity and is configurable from 5 to 240 minutes; it MUST start a new session when the user requests it or after inactivity.
- **FR-009**: When AI capabilities are disabled at the wiki level, the bot MUST decline Q&A requests with a clear status message (not a stack error).
- **FR-010**: The bot MUST apply admin-configurable per-user and per-chat rate limits to prevent abuse and to protect shared capacity; the defaults MUST be documented and covered by automated tests.

**Outbound Notifications**

- **FR-011**: System MUST create notification work for at least these events: page published, long-running AI action completed, content transfer/import/export completed.
- **FR-012**: Admins MUST be able to subscribe a bound user's direct Feishu chat, a public-safe Feishu group, or a private-recipient Feishu group to one or more event types, optionally scoped to a wiki space.
- **FR-013**: Each delivered notification MUST carry a deep link back to the relevant wiki page or admin view.
- **FR-014**: Notifications that cannot be delivered after five attempts MUST be paused and surfaced to admins; the system MUST NOT silently drop them.

**Admin Configuration**

- **FR-015**: Admins MUST be able to configure the Feishu app credentials and connection mode through the admin panel, without code changes or file edits.
- **FR-016**: Admins MUST be able to view current connection status, recent delivery health, and recent error summaries.
- **FR-017**: Admins MUST be able to view, filter, and revoke bound Feishu identities.

**Security & Audit**

- **FR-018**: Every bot-initiated wiki read or write MUST be attributed to the bound wiki user, MUST pass through the same permission chokepoint as web requests at request and job-execution time, and MUST be recorded in the audit log with the Feishu channel identified as origin.
- **FR-019**: Binding links MUST be single-use, expire after 10 minutes, and be bound to the requesting Feishu identity — they MUST NOT be reusable by a different identity.
- **FR-020**: Sensitive Feishu credentials MUST be encrypted at rest, omitted from logs and responses, replaceable without plaintext retrieval, and represented in the UI only by a masked value.
- **FR-023**: The bot MUST verify Feishu's inbound request authenticity and freshness before processing an event, and MUST reject replayed requests.
- **FR-024**: The system MUST process each inbound Feishu event and each event-to-subscription delivery idempotently, so a duplicate cannot create a second binding, Q&A action, or delivered notification.
- **FR-025**: Public-safe group cards MUST contain page metadata and links only while the event resource is publicly readable. Private-recipient group subscriptions MUST re-check each bound recipient's current permission and send protected event details only by direct message; they MUST NOT post a protected summary, title, link, or count to the group.
- **FR-026**: The Feishu integration MUST resolve the active binding server-side and establish the bound wiki user and Feishu origin from that binding alone; it MUST NOT use a shared end-user credential, accept a caller-supplied user identity, or bypass the normal permission layer. The inbound path derives the effective user only from the confirmed binding, never from the message payload.
- **FR-027**: The audit log MUST persist and expose the request origin as `feishu`, alongside the attributed wiki user, action outcome, and a correlation identifier that contains no raw question, answer, or credential.
- **FR-028**: On unbinding, revocation, or user deactivation, the system MUST immediately expire active bot sessions and stop future personal notifications. It MUST retain binding, session, and delivery data only for documented operational retention periods and exclude raw credentials from all retained data.
- **FR-029**: The system MUST never post a binding link in a group. If the bot cannot privately message an unbound group participant, it MUST provide only a non-sensitive instruction to start a direct bot chat.
- **FR-030**: A group Q&A response MAY be posted to the group only when every cited source remains publicly readable at delivery time. Otherwise the bot MUST send the answer and citations only to the @-mentioner by direct message and leave no protected title, excerpt, link, or count in the group.

**Resilience**

- **FR-021**: After an outbound-delivery outage or a web-app restart, the system MUST resume delivering pending notifications automatically without admin intervention, recovering any in-flight (claimed-but-unfinished) deliveries.
- **FR-022**: Outbound notifications generated while Feishu delivery is unavailable MUST be persisted durably and delivered once it recovers, for 72 hours by default; admins MAY configure the retention window from 24 to 168 hours.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- This feature does **not** change anonymously readable published page content, public metadata, or public navigation. No static/ISR cache impact on the public site.
- The Q&A surface exposes only content the bound wiki user can already read in the web UI; no new anonymous Wiki content/API surface is introduced. The integration adds only a signed Feishu event callback route (`/webhooks/feishu/events`), which returns no Wiki content, is kept out of the public REST/OpenAPI surface, and is not a user-facing public API.

### Key Entities *(include if feature involves data)*

- **Feishu Binding**: Links a Feishu identity (open id, union id, display name) to a wiki user. Tracks binding state (active / revoked), creation time, last-seen time, and revocation reason.
- **Bot Session**: Conversational state for one Feishu identity within a chat (1:1 or group) — chat id, binding, reference to the underlying AI conversation, last-activity time, expiry time, session state (active / expired / reset).
- **Notification Subscription**: An admin-configured rule mapping an event type (and optional space scope) to a direct bound identity, public-safe group, or private-recipient group; includes delivery state (active / paused / failing / action-required) and delivery mode.
- **Notification Delivery Record**: A single idempotent event-to-subscription delivery — event id, target, deduplication key, status (queued / delivered / failed / blocked / expired), attempt count, timestamps.
- **Connection Health**: Latest status of the Feishu integration — whether credentials are configured and valid, the last successful inbound event and outbound delivery times, and the most recent error (no secret or raw payload).
- **Feishu Integration Configuration**: Encrypted app credentials, connection mode, rate-limit settings, notification retention setting, and credential-update metadata. No plaintext secret is retained for display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new Feishu user can complete the binding flow and ask their first grounded question in under 3 minutes end-to-end.
- **SC-002**: For an answerable question, the bot returns a grounded answer with at least one source link within 10 seconds at the 95th percentile.
- **SC-003**: Permission-isolation tests, including a top-ranked unreadable source and a mixed-authority Feishu group, show zero leaked page content, citations, titles, or event metadata.
- **SC-004**: Eligible subscribed event notifications arrive in the configured chat within 30 seconds of the event at the 95th percentile.
- **SC-005**: After an outbound-delivery outage or a web-app restart, the system recovers automatically and resumes delivering pending notifications within 60 seconds, without admin intervention, in at least 95% of cases.
- **SC-006**: Admins can configure credentials, subscribe a chat to an event, and revoke a binding entirely through the UI, without editing source code or configuration files.
- **SC-007**: Deterministic integration tests show every bot-initiated read and write records the bound user, `feishu` origin, action outcome, and correlation identifier in the audit log.
- **SC-008**: Replaying an inbound Feishu event or re-running an event delivery produces no second binding, Q&A action, or delivered notification.

## Assumptions

- The wiki already provides permission-aware content and AI Q&A surfaces, a long-running AI action surface, an audit log, and an admin panel; this feature reuses those capabilities rather than duplicating their business logic.
- The current user-session Q&A entry point is reused directly, in-process, under the bound user's permission context. This feature adds an explicitly registered integration module that preserves the bound user, permission evaluation, and audit origin rather than treating a shared API key as that user; no separate process or service credential is introduced.
- Feishu app credentials (app id, app secret) are provisioned by the operator in the Feishu Developer Console before configuration; this feature does not register the Feishu app on the operator's behalf.
- One bot instance serves one wiki deployment; multi-tenant Feishu marketplace distribution is out of scope for v1.
- Users have network access to both the wiki and Feishu from their devices.
- The operator configures an externally reachable HTTPS callback (through the wiki's existing ingress/reverse proxy) in the Feishu Developer Console; it is required only when the optional integration is enabled.
- The integration is an explicitly registered module inside the single wiki web application: the inbound Feishu callback is a route handler and outbound delivery uses the existing background job runner. The wiki remains the only authoritative entrypoint for permission checks, audit, and business logic. No separate process, image, port, or inter-process contract is introduced.
- The integration is optional: an unconfigured deployment remains fully usable without Feishu, and the module stays inert until an admin configures credentials. It reuses the same application image, PostgreSQL state, and job runner as the wiki and adds no stateful service or mandatory external dependency.
- The default conversational session window and notification retention window are specified above. Rate-limit defaults will be selected during planning from Feishu platform limits and documented before implementation.
- The initial set of notifiable events is page-published, AI-action-completed, and transfer/import/export-completed; additional event types may be added in later iterations.
- Group-chat Q&A uses the @-mentioner's binding for retrieval scope and audit attribution; widening retrieval to the union of all bound users in a chat is out of scope for v1.
