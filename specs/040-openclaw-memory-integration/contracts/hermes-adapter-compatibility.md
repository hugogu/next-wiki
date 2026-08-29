# Hermes Memory Compatibility Contract

Hermes remains an optional Python adapter for the unified `/api/v1/memory`
service. No OpenClaw package, connection, or shared grant is required to run
Hermes Memory.

Existing Hermes credentials retain their 039 key-binding and namespace
resolution. Existing save, recall, evidence, diagnostics, and forget requests
remain valid: recall defaults to the caller's own namespace and save/evidence
remain private. A later owner can issue a connection-backed credential to the
same adapter configuration without rewriting historical records.

When Hermes adopts additive fields, it uses the generic `connection` capability
snapshot, closed `captureKind`, and optional recall scope exactly as OpenClaw
does. It never sends product identity, a target namespace, a grant identifier,
or an arbitrary provenance value. Hermes regression tests remain mandatory for
every shared API/schema change.
