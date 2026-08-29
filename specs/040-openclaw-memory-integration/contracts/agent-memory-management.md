# Agent Memory Owner Management Contract

**Feature**: 040-openclaw-memory-integration
**Audience**: authenticated Wiki owners and administrators

This management surface provisions generic memory connections for any adapter.
It is deliberately separate from the bearer-agent API in
[Unified Agent Memory REST Contract](./agent-memory-rest-api.md).

## Connections and credentials

A connection is an immutable server-generated identity with one owner, stable
agent identity/display label, state (`active`, `disabled`, or `revoked`), and
one private namespace. Credentials bind to a connection and may be rotated
without changing it. The management UI/API may:

- create a connection and its private namespace;
- issue, rotate, or revoke credential bindings;
- disable or revoke the connection; and
- show safe activity/status metadata.

It never asks the adapter to choose a namespace. A legacy 039 key binding can
continue using its namespace while the owner provisions a connection-backed
credential; no automatic conversion of existing records is required.

## Shared recall

Owners may create a namespace whose role is `shared`. A read grant connects one
active shared namespace to one active connection and has state `active`,
`revoked`, or `expired`, a grantor, and optional expiry. The management surface
may create, enumerate for the owner, expire, or revoke a grant.

Grant creation/revocation is owner/session-only. The agent API does not accept
a destination/grant identifier. At recall time the service derives eligible
sources from the caller's active grants and rechecks them before output. A
revoked or unavailable source is omitted indistinguishably from a non-match.

## Curated promotion

Private captures and explicit saves remain private. To share information, an
owner chooses eligible private evidence and invokes promotion. The service
creates a new, owner-attributed `curated` record in an owner-selected shared
namespace and immutable links to supporting evidence. It does not mutate or
automatically promote the original capture.

## Excluded policy surface

This feature adds no per-destination retention-policy management. Source
content uses the Wiki's existing retention policy; expired local/temporary
capture data is handled by fixed bounded TTL/capacity controls. Management
operations and audit records must never store raw prompt, transcript, query,
title, secret, or session digest.
