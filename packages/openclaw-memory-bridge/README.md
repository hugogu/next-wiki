# next-wiki OpenClaw Memory Bridge

This optional, non-capability OpenClaw plugin adds cited external memory while leaving OpenClaw's local memory provider unchanged. Configure a versioned next-wiki `/api/v2/memory` URL and a SecretRef-resolved bearer credential. Capture is opt-in and uses a bounded, permission-protected local outbox; hooks never make a completed turn wait for the Wiki.

Enable optional tools only through OpenClaw's tool policy. Save and forget are approval-gated actions. The `before_compaction` hook is observational because OpenClaw does not expose a compaction veto surface.
