# @next-wiki/openclaw-memory-bridge

An OpenClaw plugin bridging Gateway session lifecycle to next-wiki's generic
Agent Memory REST API (`/api/v1/memory/*`). Hook-only / non-capability: it
never claims `plugins.slots.memory` and coexists with an installed local
memory provider.

Create a dedicated connection first, in the Wiki's **User Center → API Keys →
Agent memory connections** section (see the Agent Memory Guide published on
your Wiki instance at `/help/agent-memory-guide`). Copy the shown credential
into your own secret store — it can never be shown again after that dialog
closes.

## Configuration

```json
{
  "wikiApiBaseUrl": "https://wiki.example.com/api/v1",
  "credential": "${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}",
  "capture": { "enabled": false, "modes": ["session_end"] },
  "tools": { "enabled": false },
  "sharedRecall": { "enabled": false },
  "promptEnrichment": { "enabled": false }
}
```

`credential` is a secret reference resolved by the operator's own secret
store, never a literal committed to a plugin configuration file. Every
feature defaults to **off**:

- `capture` — non-blocking, restart-safe automatic evidence capture from the
  selected lifecycle `modes` (`turn`, `checkpoint`, `compaction`,
  `session_end`), delivered through a local outbox capped at 500
  entries/256 KB each with a 7-day TTL and exponential retry backoff (5s–10min).
- `tools` — registers the optional `agent_memory_search`, `agent_memory_save`,
  `agent_memory_forget`, and `agent_memory_status` tools.
- `sharedRecall` — lets the search tool and prompt enrichment also draw on
  any shared destination an owner has granted this connection read access to
  (in **User Center → API Keys → Deliberate sharing**), in addition to its
  own private destination. The bridge itself can never create a grant or a
  shared destination.
- `promptEnrichment` — injects a few bounded, escaped, cited recall results
  into a second-phase prompt hook automatically, without a tool call.
