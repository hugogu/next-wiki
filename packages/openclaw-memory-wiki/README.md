# @next-wiki/openclaw-memory-wiki

Native OpenClaw plugin that mirrors eligible `.md` files from the OpenClaw
Memory Wiki vault into next-wiki's account-bound Raw space, optionally
archives real OpenClaw session transcripts as readable Markdown, and adds a
bundled Skill for account-wide Wiki/Raw/Generated retrieval.

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
          "sessionsAgentId": "main",
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
| `sessionsAgentId` | OpenClaw agent id | Optional; omit to disable session archiving entirely. When set, real (non-heartbeat, non-spawned) sessions for that agent are archived — see below. |
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

## Session archiving

Set `sessionsAgentId` to also mirror that OpenClaw agent's real conversation
history — not just curated notes — so the full exchange is readable in the
wiki, not only the agent's own after-the-fact summary of it.

- **Discovery** goes through OpenClaw's own `plugin-sdk/session-store-runtime`
  session-store API, not filesystem globbing, so it stays correct across the
  host's own storage changes.
- **Filter**: a session is archived only when it is neither a synthetic
  heartbeat/cron-created isolated session nor a sub-agent/tool-spawned one.
  Every other session — including forked/topic child sessions — counts as a
  real conversation.
- **Format**: each session renders as readable Markdown under
  `sessions/<sessionId>/NNN.md` — `## User` / `## Assistant` sections per
  turn, with tool calls, tool results, and thinking blocks folded into
  `<details>` blocks so the primary narrative stays skimmable. Bookkeeping
  entries (model/thinking-level changes, compaction, labels, …) are omitted.
- **Chunking**: the mirror endpoint caps `content` at 512,000 characters. A
  session that would exceed it splits into ordered, size-bounded chunks
  (`001.md`, `002.md`, …). Chunk boundaries are append-stable — an earlier
  chunk's content never changes once a later one exists, so a growing session
  only ever re-mirrors its current, still-filling chunk.
- **Retirement**: if a session shrinks below its previous chunk count, the
  now-orphaned trailing chunk(s) retire through the same mechanism as a
  deleted vault file.

Session content is a materially larger privacy surface than curated notes —
review who can read the target Raw space before enabling this.
