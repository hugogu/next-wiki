# @next-wiki/openclaw-memory-bridge

An OpenClaw plugin bridging Gateway session lifecycle to next-wiki's generic
Agent Memory REST API (`/api/v1/memory/*`). Hook-only / non-capability: it
never claims `plugins.slots.memory` and coexists with an installed local
memory provider.

## Configuration

```json
{
  "wikiApiBaseUrl": "https://wiki.example.com/api/v1",
  "credential": "${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}",
  "capture": { "enabled": false, "modes": ["session_end"] },
  "promptEnrichment": { "enabled": false }
}
```

`credential` is a secret reference resolved by the operator's own secret
store, never a literal committed to a plugin configuration file.
