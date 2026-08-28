# Agent Memory v2 REST Contract

**Audience**: OpenClaw bridge and future external-agent adapters.

**Compatibility**: /api/v1/memory remains supported for the existing Hermes provider. This document defines the additive client-neutral v2 contract. No request or response field makes OpenClaw part of server authorization or storage.

## Common Rules

- Base path: /api/v2/memory.
- Authentication: Authorization Bearer dedicated-memory-key. Every route requires an active server-bound Agent Memory Connection and the appropriate memory scope.
- Requests and responses are JSON, private, and no-store. They use shared Zod schemas and generated OpenAPI.
- Client identity/version headers are bounded untrusted compatibility telemetry only, never authorization input.
- Payloads follow advertised limits. Body/idempotency metadata never enters audit.
- Omitted resources, revoked grants, disabled destinations, and records outside the resolved access set return safe non-disclosure. No route accepts destination, grant ID, source agent, page path, or page ID as a selector.

## GET /connection

Returns safe discovery for the authenticated connection.

**Authorization**: Any memory scope.

~~~json
{
  "apiVersion": "v2",
  "connection": {
    "id": "uuid",
    "state": "active",
    "agentIdentity": "assistant-a"
  },
  "capabilities": {
    "recall": true,
    "explicitSave": true,
    "forget": true,
    "asynchronousCapture": true,
    "grantedRecall": true,
    "sharedWrite": false
  },
  "limits": {
    "maxRecallResults": 10,
    "maxRecallQueryCharacters": 4000,
    "maxRecordCharacters": 16000,
    "maxCaptureCharacters": 64000
  }
}
~~~

It does not enumerate grants, other destinations, other agent labels, or capture contents. Disabled/revoked states produce a safe unavailable result.

## GET /diagnostics

Returns a credential-safe category for setup and status tools.

**Authorization**: Any memory scope.

~~~json
{
  "status": "healthy",
  "apiVersion": "v2",
  "connectionState": "active",
  "grantedScopes": ["memory.read", "memory.write"],
  "lastSafeOutcome": {
    "operation": "capture",
    "at": "2026-08-28T10:00:00.000Z",
    "status": "durable"
  }
}
~~~

Status is healthy, incomplete, forbidden, unavailable, or incompatible. It never includes endpoint credentials, destination names, query/body text, record counts, or protected error bodies.

## POST /recall

Returns bounded citations/excerpts for the server-derived allowed source set.

**Authorization**: memory.read.

~~~json
{
  "query": "What cross-agent decision exists about retry handling?",
  "scope": "granted",
  "limit": 5
}
~~~

| Field | Rules |
|---|---|
| query | Required normalized 1–4,000 characters; never stored in audit. |
| scope | Required own, granted, or own_and_granted. It is intent, not an identifier; granted is the bridge external-search default. |
| limit | Optional 1–server maximum. |

~~~json
{
  "results": [
    {
      "memoryId": "uuid",
      "role": "synthesis",
      "excerpt": "Use a deterministic idempotency key for capture retries.",
      "citation": {
        "pageId": "uuid",
        "revisionId": "uuid",
        "revisionHash": "sha256",
        "canonicalUrl": "https://wiki.example/…"
      }
    }
  ],
  "retrieval": { "mode": "lexical", "complete": true, "returned": 1 }
}
~~~

Candidate selection and every backing record/page/revision are rechecked after grant expansion and before serialization. Empty results are distinct from an unavailable service but never disclose an ungranted source.

## POST /records

Creates an explicit recallable record in the server-derived write destination.

**Authorization**: memory.write.

~~~json
{
  "idempotencyKey": "stable-client-event-key",
  "content": "Documented memory text",
  "title": "Optional bounded title",
  "tags": ["decision"],
  "nature": "generated",
  "evidenceIds": ["uuid"]
}
~~~

The caller cannot set destination, a curated role, promotion origin, page path, or arbitrary source metadata. Same key plus different normalized content is a safe conflict; the same key/payload returns the existing citation. The server appends a restricted Raw revision and returns 201 or idempotent 200.

## DELETE /records/{memoryId}

Marks an accessible active record forgotten. The Raw page/revision and provenance remain unchanged. A record outside the resolved connection access set receives the same safe not-found category as an absent record.

**Authorization**: memory.delete.

The optional body contains only a bounded reason. It is not stored as content or raw audit metadata.

## POST /captures

Submits selected opted-in capture material for asynchronous durable ingestion.

**Authorization**: memory.write.

~~~json
{
  "idempotencyKey": "stable-capture-event-key",
  "sessionDigest": "lowercase-hex-digest",
  "checkpoint": true,
  "origin": "checkpoint",
  "messages": [
    { "role": "user", "content": "Selected source text" },
    { "role": "assistant", "content": "Selected summary text" }
  ]
}
~~~

- `origin` is a closed enum (`automatic_capture` or `checkpoint`) and `checkpoint` identifies whether the material was collected at a checkpoint boundary.
- Only normalized selected user/assistant source rows are accepted. System messages, tool calls/results, secrets, arbitrary metadata, and nested payload shapes are rejected.
- The service encrypts the temporary envelope and queues a capture ID. It does not place message bodies in background job payloads or claim durability before the Raw revision exists.

~~~json
{
  "captureId": "uuid",
  "status": "queued",
  "durable": false,
  "idempotent": false,
  "pollUrl": "/api/v2/memory/captures/uuid"
}
~~~

## GET /captures/{captureId}

Returns capture state to the authenticated connection.

**Authorization**: memory.write.

Terminal durable state contains only resulting record ID and citation. Failed and cancelled states contain a closed safe error category. Connection/grant changes are evaluated before every result; stale/revoked callers do not learn capture state.

## Error Categories

The shared public-error mapping uses credential-safe categories such as AGENT_MEMORY_SCOPE_REQUIRED, AGENT_MEMORY_CONNECTION_UNAVAILABLE, AGENT_MEMORY_CAPTURE_INVALID, AGENT_MEMORY_RECORD_NOT_FOUND, AGENT_MEMORY_IDEMPOTENCY_CONFLICT, and AGENT_MEMORY_INCOMPATIBLE_CLIENT. It never relays raw upstream or worker error details.
