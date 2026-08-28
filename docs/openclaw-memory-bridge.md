# OpenClaw externalized memory bridge

The bridge is an optional OpenClaw plugin that talks to next-wiki's generic Agent Memory v2 API. It does not claim OpenClaw's exclusive memory slot and does not replace the configured local memory provider. Each agent receives a server-generated connection and private destination; the server evaluates sharing grants.

## Install and configure

Create a connection and a memory-only API credential in User Center. Store the credential in OpenClaw's SecretRef store and configure the bridge with a versioned HTTPS URL such as `https://wiki.example.com/api/v2/memory`. Do not put credentials in source files, shell history, prompts, diagnostics, or normal logs. Native OpenClaw plugins run in the Gateway process, so install only reviewed packages and treat the plugin as process-trusted code.

The bridge's capture and external-context features are disabled by default. Optional tools must be enabled through the host tool policy. Automatic prompt enrichment additionally requires the host's conversation-access and prompt-injection permissions. Save and forget requests use an allow-once/deny approval and still require server scopes.

## Capture and recovery

Lifecycle hooks only record intent into a bounded, permission-protected local outbox. The outbox uses deterministic event IDs, recovers in-flight entries after restart, retries with bounded backoff, and quarantines terminal failures. It submits capture IDs to the server; raw transcript text is not placed in generic pg-boss job data. A capture becomes `durable` only after an immutable restricted Raw page and revision exist. `before_compaction` is observational because OpenClaw does not expose a compaction-veto hook; it cannot guarantee persistence before compaction returns.

On a disabled or revoked connection, pause the bridge, rotate or issue a new credential in User Center, and resume the outbox. Credential rotation does not change the stable connection. Revoking the connection cancels future delivery and does not delete immutable Raw revisions.

## External recall

`next_wiki_memory_search` searches only the server-derived own or granted scope and returns bounded excerpts with immutable revision citations. The bridge labels injected context as external memory, escapes it as untrusted text, and fails open when the server is unavailable. Local OpenClaw memory remains independent and continues to answer when external recall is disabled or offline.

## One-time migration

Install `@next-wiki/openclaw-memory-migrate` separately. Discover and preview selected Markdown files first, then explicitly approve the run. The encrypted ledger stores source fingerprints and deterministic `import:<sha256>` idempotency keys, supports interruption/resume, and never changes or deletes source files. Imported records use the closed `origin=import` provenance; local paths and arbitrary metadata are not sent as server capabilities.

## Upgrade and incident handling

Before upgrading, drain or preserve the outbox and keep the migration ledger backup in the protected plugin-data directory. Validate the packed plugin manifest and runtime on a compatible Gateway. If a credential is exposed, revoke it immediately, issue a replacement, inspect redacted diagnostics and the Admin Access Log, and remove only the local compromised credential reference. Do not copy memory bodies, prompts, queries, titles, session digests, or tool output into an incident ticket.
