# @next-wiki/openclaw-memory-wiki

Native OpenClaw plugin that mirrors eligible `.md` files from the OpenClaw
Memory Wiki vault into next-wiki's account-bound Raw space and adds a bundled
Skill for account-wide Wiki/Raw/Generated retrieval.

Install the packed plugin with `openclaw plugins install <tarball>`. Configure
`baseUrl`, `vaultPath`, and one OpenClaw SecretRef containing a generic Agent
Memory provider API key. Set its agent identity to `openclaw`; the key's
ordinary scopes independently control
Agent Memory reads/writes and next-wiki search/page reads; Raw/Generated space
access is an explicit administrator grant on that same key. Keep the key out
of ordinary config files.

## Configuration

Add the plugin entry to `openclaw.json` (or install first with
`openclaw plugins install @next-wiki/openclaw-memory-wiki`):

```json
{
  "plugins": {
    "entries": {
      "next-wiki-memory-wiki": {
        "enabled": true,
        "config": {
          "baseUrl": "https://kb.example.com",
          "apiKeyRef": { "source": "env", "provider": "default", "id": "NEXT_WIKI_API_KEY" },
          "vaultPath": "~/.openclaw/wiki/main",
          "memoryPath": "~/.openclaw/workspace/memory",
          "syncIntervalMinutes": 5
        }
      }
    }
  }
}
```

| Field | Value | Notes |
| --- | --- | --- |
| `baseUrl` | next-wiki origin | HTTPS (or loopback HTTP). **Origin only** — no `/api/v1` suffix; a copied API base is auto-normalized. |
| `apiKeyRef` | OpenClaw SecretRef | Plain strings and `{source: "env"\|\"file\"\|\"exec\"}` refs both work. The key needs the Agent Memory `memory.write` scope for sync; `memory.read` + `view` enable `next_wiki_search`/`next_wiki_get`. |
| `vaultPath` | Memory Wiki vault dir | `~` is expanded; must already exist. |
| `memoryPath` | memory-core dir override | Optional; defaults to the active OpenClaw workspace's `memory/` directory. The workspace-root `MEMORY.md` and `USER.md` are also mirrored automatically. A missing directory is treated as empty until memory-core creates it. |
| `syncIntervalMinutes` | `1`–`1440`, default `5` | How often the mirror scan runs. |

After changing config, restart the gateway (`systemctl --user restart
openclaw-gateway.service`). Verify with the `next_wiki_status` tool, then
check the gateway journal for `[next-wiki-memory-wiki]` lines — skip warnings
with a reason, one-line `sync complete: scanned=… uploaded=… unchanged=…
retired=… failed=… skipped=…` summaries on every successful run, and `error`-level
lines on startup or sync failures.

Files larger than 512 KB are **skipped with a warning** (logged and counted as
`skipped` in status) instead of aborting the run — move or shrink oversized
notes and the next sync picks them up. Empty or whitespace-only files are
skipped the same way; a later edit with real content is mirrored on the next
scan, and a source that had content and is now blank is retired like a deleted
one. Scan-level failures are logged with their cause rather than failing
silently.

The scanner preserves each Markdown file's bytes, frontmatter, links, and
relative source path in immutable next-wiki Revisions. It mirrors both the
Memory Wiki vault and memory-core's root `MEMORY.md` and `USER.md`,
`memory/YYYY-MM-DD.md`, and nested Markdown files; memory-core paths carry a
`memory-core/` source prefix and use a distinct Raw subtree. Content already represented by a
`sourceType: memory-bridge` source, including duplicate root/nested
`MEMORY.md` files, is mirrored only once; transient `memory/working/` traces
are excluded. Re-running a scan with the same digest is unchanged; changing a
file creates one new current Revision. When a previously mirrored source
disappears from a complete scan, it is retired from Agent retrieval while its
Raw page and revision history remain available for audit; a reappearing path is
restored. Attachments and `.openclaw-wiki` state are excluded. A failed upload
is retried with bounded backoff and remains visible as degraded status for
manual repair.

The plugin never modifies the local vault, OpenClaw active-memory records, or
the Memory Wiki compiler.

## Scope: this plugin is transport, not a producer

It mirrors Markdown that already exists on disk. It does not read, parse, or
interpret OpenClaw's internal formats, and it should not gain the ability to.

Anything that needs to *become* wiki content — chat transcripts, summaries,
extracted concepts — is the job of a **producer** on the OpenClaw side that
writes Markdown into the workspace `memory/` tree (or the Memory Wiki vault).
The mirror then carries it with no plugin change at all. The existing Memory
Bridge already works exactly this way; `memory/notes/…`, `memory/working/…`
and `memory/dreaming/…` all reach the wiki through it:

```yaml
---
pageType: source
sourceType: memory-bridge
sourcePath: /home/<user>/.openclaw/workspace/memory/notes/2026-09-16-topic.md
bridgeRelativePath: memory/notes/2026-09-16-topic.md
bridgeAgentIds: [main]
---
```

**To archive chat transcripts**, write them as Markdown under
`~/.openclaw/workspace/memory/…` and this plugin mirrors them on the next
scan. Keep three constraints in mind on the producer side, because they are
the producer's to own and not the transport's:

- **Which sessions count.** Cron/heartbeat/sub-agent sessions are not
  conversations. Their keys look like `agent:<id>:cron:<jobId>`,
  `<base>:heartbeat` and `agent:<id>:subagent:<uuid>`; the store fields
  `heartbeatIsolatedBaseSessionKey` / `spawnedBy` were observed *not* set on
  real cron sessions, so filter on the key.
- **Secrets.** Tool-call arguments and thinking text both carry live
  credentials verbatim in practice. Scrub deterministically at the producer,
  which has the actual secret values to match against — a downstream mirror
  can only guess, and guessing is how credentials leak.
- **Size.** A single mirrored file over 512 KB is skipped as `too_large`, so
  split long transcripts (per day, or numbered parts) at the producer.

Version 0.4.0 briefly implemented session archiving inside this plugin; it was
removed in 0.5.0 because it put producer responsibilities in the transport
layer. See the repository history for the full reasoning.
