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
| `syncIntervalMinutes` | `1`–`1440`, default `5` | How often the mirror scan runs. |

After changing config, restart the gateway (`systemctl --user restart
openclaw-gateway.service`). Verify with the `next_wiki_status` tool, then check
the gateway journal for `[next-wiki-memory-wiki]` scan/skip/run lines.

Files larger than 512 KB are **skipped with a warning** (logged and counted as
`skipped` in status) instead of aborting the run — move or shrink oversized
notes and the next sync picks them up. Scan-level failures are logged with
their cause rather than failing silently.

The scanner preserves each Markdown file's bytes, frontmatter, links, and
relative source path in immutable next-wiki Revisions. Re-running a scan with
the same digest is unchanged; changing a file creates one new current Revision.
Attachments and `.openclaw-wiki` state are excluded. A failed upload is retried
with bounded backoff and remains visible as degraded status for manual repair.

The plugin never modifies the local vault, OpenClaw active-memory records, or
the Memory Wiki compiler.
