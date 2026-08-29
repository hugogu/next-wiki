# @next-wiki/openclaw-memory-bridge

An OpenClaw plugin bridging Gateway session lifecycle to next-wiki's generic
Agent Memory REST API (`/api/v1/memory/*`). Hook-only / non-capability: it
never claims `plugins.slots.memory` and coexists with an installed local
memory provider.

Create a dedicated API key first, in the Wiki's **User Center → API Keys**,
using the **Memory provider** preset (the same one Hermes uses). Give it a
stable **agent identity** (e.g. `openclaw`). Recall is isolated per
`(destination, agent identity)`: choosing **use shared destination** at
creation time only groups keys into the same destination row for
administration, it does not by itself unify recall. If you want this
OpenClaw installation to actually see an existing Hermes or OpenClaw key's
memory, give both keys the *same* agent identity in addition to sharing the
destination. Copy the shown credential into your own secret store; it can
never be shown again after that dialog closes.

## Configuration

```json
{
  "wikiApiBaseUrl": "https://wiki.example.com/api/v1",
  "credential": "${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}",
  "capture": { "enabled": false, "modes": ["session_end"] },
  "tools": { "enabled": false },
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
  `agent_memory_forget`, and `agent_memory_status` tools, scoped to this key's
  bound destination.
- `promptEnrichment` — injects a few bounded, escaped, cited recall results
  from this key's bound destination into a second-phase prompt hook
  automatically, without a tool call.
