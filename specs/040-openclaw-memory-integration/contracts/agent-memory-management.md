# Agent Memory Connection Management Contract

**Audience**: Authenticated next-wiki owners in User Center.

This is the canonical owner-management hierarchy. It is session-authenticated, owner-scoped, non-public, and distinct from the bearer-agent contract in [Agent Memory v2 REST API](./agent-memory-v2-rest-api.md).

## Resources

~~~
/api/api-keys/agent-memory/connections
/api/api-keys/agent-memory/connections/{connectionId}
/api/api-keys/agent-memory/connections/{connectionId}/credentials
/api/api-keys/agent-memory/connections/{connectionId}/read-grants
/api/api-keys/agent-memory/connections/{connectionId}/write-grants
~~~

All identifiers are UUIDs. Every route confirms the owner before reading/changing it. The agent bearer key cannot call these routes.

## Connections

GET connections returns owner-visible summaries: ID, display name, immutable agent identity, state, private destination label, active credential presence, and grant counts. It never returns a secret.

POST connections creates one active connection and a new private destination. Input has bounded display name, immutable agent identity, and selected least-privilege scopes. The credential secret is revealed exactly once through the existing API-key reveal flow; it never appears in a URL, log, or audit body.

PATCH connection may change owner-visible label or disable the connection. It cannot change immutable identity or silently rehome existing records. Disabled/revoked connections reject bearer operations and pending capture replay.

DELETE connection is a soft/revocation operation, not data deletion. It revokes active credentials and grants while retaining Raw records, revisions, and audit history.

## Credentials

POST credentials creates a credential resource bound to the same stable connection and may retire the prior credential after successful creation. This is rotation through a nested resource rather than an action-style URL. Pending client outbox deliveries retain their connection identity/idempotency key and are reauthorized by the replacement credential.

The endpoint accepts only memory scopes. It cannot widen generic page/Raw/admin permissions or bind the credential to another connection/destination.

## Read and Write Grants

GET read-grants and GET write-grants return owner-visible summaries for the connection. They may include destination labels because this is an owner session, never an agent response.

POST read-grants creates an active read grant for an owner-owned source destination. POST write-grants is a separately reviewed action that creates a shared-write right. Inputs contain only a destination ID selected from the owner's eligible destinations and an optional bounded expiry. Neither grant creates a path prefix, public visibility, or arbitrary federation.

DELETE an individual grant revokes it. Subsequent recall/writes are denied; already stored Raw evidence remains unchanged. The v2 service rechecks immediately before response serialization, making revocation races safe.

## Owner Promotion and Retention

Owner promotion from private evidence/synthesis to curated shared knowledge is an explicit authenticated resource operation. It creates a new attributable record/revision and immutable provenance link; it does not alter source text, automatically publish a page, or create a grant. Retention changes update recall eligibility/archival policy only and cannot remove source-revision citations from active recallable material.

## UI Contract

The User Center API Keys page presents one Agent Memory connections section: connection status, credential rotation, private destination, and dedicated read/write grant management. It uses existing modal/dialog primitives and server-backed URLs; no duplicate management page or browser alert is introduced. Destructive/revocation/share actions need an explicit confirmation dialog with generic non-secret copy.

Every mutation emits safe agent_memory audit metadata and refreshes only authenticated views. It never affects public cache content.
