# next-wiki Hermes Memory Provider

Use a [next-wiki](https://github.com/hugogu/next-wiki) instance as the durable,
inspectable memory destination for one configured agent identity. Hermes is the
first client integration. Records are stored as immutable, append-only Raw
entries with published revisions. Each memory-provider API key is bound
server-side to one memory destination and identity, so a client cannot select
another profile's namespace through a tool argument or URL.

## Install and activate

1. Enable **LLM Wiki** writing mode so the shared Raw space is available. Then
   open **User Center → API Keys** and select **Memory provider**. Set the
   non-secret **Agent identity** (normally `hermes`). The preset grants only `memory.read`, `memory.write`, and
   `memory.delete`; it does not grant generic page access. Copy the secret once.
2. Install the provider:

   ```bash
   python -m pip install next-wiki-hermes-memory
   hermes memory setup
   hermes memory status
   ```

3. Select `next-wiki` in the Hermes picker. Enter the versioned API base URL
   (for example `https://wiki.example.com/api/v1`) and enter the key only at
   Hermes's secret prompt. Hermes exposes it as `NEXT_WIKI_MEMORY_API_KEY`.

The primary distribution path is the Python entry point
`hermes_agent.memory_providers`. For development only, a package can be placed
under `$HERMES_HOME/plugins/next-wiki` or `./.hermes/plugins/next-wiki` (the
latter needs `HERMES_ENABLE_PROJECT_PLUGINS=1`). Do not install two providers
with the `next-wiki` slug: Hermes uses discovery precedence and reports the
first matching provider.

This provider calls the versioned REST endpoints under `/api/v1/memory/*`.
`/api/v1/mcp` is not a Memory endpoint; the separate
`@next-wiki/mcp-server` package is a stdio MCP adapter for generic Wiki tools.
Hermes renders every model-selected function in the same generic “Tool Call”
panel, so seeing `next_wiki_memory_*` there is expected and does not mean MCP
is being used. Native provider calls are routed by Hermes's `MemoryManager`;
they do not have an `mcp__` prefix and do not require an MCP server entry.
If the tool name has an `mcp__` prefix or the configuration is under
`mcp_servers`, a separate MCP integration is being used instead of this
provider.

## Safe configuration and checks

The provider writes only non-secret settings (including `agent_identity`) to
`$HERMES_HOME/next-wiki-memory.json`; the secret belongs in Hermes's profile
secret store. It never accepts a key as a command-line argument.

```bash
# Preview a local configuration without writing it or contacting the Wiki.
next-wiki-hermes-memory init --wiki-url https://wiki.example.com/api/v1 --dry-run

# Active-provider commands, after selecting next-wiki in Hermes.
hermes next-wiki status  # local only; never prints the key
hermes next-wiki check   # validates TLS, authentication, binding, and scopes
```

`status` is intentionally offline. `check` returns repair guidance for invalid
or revoked keys, insufficient scopes, redirects, timeouts, an unavailable
route, and incompatible versions without echoing response bodies or secrets.

| Deployment | API URL example |
| --- | --- |
| Local Hermes + local Wiki | `http://127.0.0.1:3000/api/v1` |
| Remote / reverse-proxied Wiki | `https://wiki.example.com/api/v1` |
| Hermes in another container | the Wiki's reachable container/DNS address, normally HTTPS behind the proxy |

Remote URLs must use HTTPS. A loopback URL is valid only when Hermes runs in
the same network namespace as the Wiki; Docker containers generally cannot use
the host's `127.0.0.1`.

Every request identifies itself with the stable
`next-wiki-memory/<provider-version>` User-Agent. If a reverse proxy or
Cloudflare returns `Error 1010` or
`browser_signature_banned`, the provider reports `transport_blocked` rather
than a misleading memory-scope error. Allow the `next-wiki-memory/*` User-Agent
at the edge (or route the provider through a trusted proxy); do not broaden API
key scopes until the edge returns the Wiki's normal JSON response.

## Memory behavior and privacy

Hermes receives three namespaced tools:

- `next_wiki_memory_search(query, limit)` recalls only the key's destination;
- `next_wiki_memory_save(content, title?, tags?)` writes an immutable Raw
  memory record; and
- `next_wiki_memory_forget(memory_id, reason?)` hides an explicit memory record
  from future recall in that same destination. The original Raw entry is never
  changed; immutable evidence records are not deleted by this operation.

Recall results contain a canonical Wiki revision citation and may have
`type: "memory"` for an explicit save or `type: "evidence"` for a durable
automatic capture. Automatic turn capture is disabled by default. Explicit
`next_wiki_memory_save` calls still
work when capture is off; the model must choose that tool itself. To capture
eligible conversation turns automatically:

1. Re-run `hermes memory setup`, select `next-wiki`, and answer **yes** to the
   `capture_enabled` / conversation-capture field. For an existing profile,
   you may instead edit `$HERMES_HOME/next-wiki-memory.json` and change only
   `"capture_enabled": false` to `true`. Preserve the existing URL, identity,
   and version fields, and never add the API key to this file.
2. Restart the Hermes process (or gateway/container) and start a new session;
   the provider reads this policy during initialization.
3. Run `hermes next-wiki status` and confirm `Capture enabled: yes`. `check`
   validates connectivity and authorization, but does not itself enable or
   prove a capture.

When enabled, each completed eligible turn is submitted asynchronously to
`/api/v1/memory/evidence`. The provider keeps only user and assistant text,
excluding tool calls/results and system content, and skips delegated or other
non-primary contexts. The Wiki worker then writes an immutable Evidence Record
and Raw revision. Once the capture reaches `durable`, it is directly searchable
through `next_wiki_memory_search`; there is no separate memory-synthesis job to
wait for. Inspect the **Agent Memory** category or the `agent_memory` filter in
Admin → Access Log while testing. A normal turn does not wait for this write,
so allow the worker time to process it and use a disposable conversation when
testing.

Strict pre-compression checkpoints are opt-in and require a Hermes runtime that
supports checkpoint API v2. When enabled, compression must not treat a
checkpoint as successful until the queued capture reports `durable`; a failed
or timed-out capture fails closed. Keep strict mode off on older Hermes
versions, and verify it after every Hermes upgrade.

## Rotation, recovery, and backups

Create a new dedicated key, re-run setup, confirm `hermes next-wiki check`,
then revoke the old key in **User Center → API Keys**. Revocation stops future
access immediately. Forget changes only the Hermes record's recall state, so
the immutable Raw entry retains its original content and revisions for
administrators according to the Wiki's Raw-space retention policy.

Back up the Wiki database and content store with the normal deployment backup
procedure; memory pages and their revision citations are included. The normal
[deployment guide](../../docs/deployment.md) covers the shared backup and
reverse-proxy procedures. This README is the canonical Hermes integration guide
shipped with the provider and linked from the Wiki's first-run integration page.
