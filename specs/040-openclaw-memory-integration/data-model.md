# Data Model: OpenClaw Agent Memory Bridge

## No schema changes

This feature adds no table, column, enum, or migration. It reuses the
existing 039 Agent Memory schema exactly as-is:

- `agent_memory_namespaces` — an owner-controlled memory destination.
- `agent_memory_key_bindings` — resolves one API key to its destination and
  agent identity. `namespaceId` is a plain foreign key (not unique), so
  multiple keys can already be bound to the same destination when an owner
  chooses **use shared destination** at key-creation time
  (`memoryProvider.sharedNamespaceId` in `apiKeyService.create`).
- `agent_memory_records` — a recallable projection pointing to one immutable,
  restricted Raw page/revision.
- `agent_memory_evidence_links` — links an evidence record to the memory
  record it produced.
- `agent_memory_captures` — durable capture delivery state, keyed by
  `(namespaceId, agentIdentity, idempotencyKey)` for retry-safe dedup.

The OpenClaw bridge is just another client of the existing
`requireAgentMemoryAccess` resolver and `agent-memory.ts` service — same
resolution path Hermes already uses, with no branching on which adapter is
calling.

## Local state (not server schema)

The bridge package keeps its own local, restart-safe outbox using OpenClaw's
`runtime.state.openKeyedStore` — this is Gateway-local state, not a Wiki
database table. See `packages/openclaw-memory-bridge/src/outbox.ts` and
spec.md's Bounded Limits for its capacity/TTL/retry caps.
