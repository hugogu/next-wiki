# Agent Memory Backend — Hermes Provider

The `next-wiki-hermes-memory` package lets Hermes store durable memory in this
Wiki without giving it the generic page API. A dedicated memory-provider API
key is bound to one server-side memory destination and `agent_identity`. The provider cannot override that
destination with a request parameter, profile name, or path prefix.

Memory and opted-in evidence are written as restricted, immutable entries in the
shared **Raw** space. The existing Raw/page-revision/content-store writer
publishes the original body once and invokes the common Wiki indexing,
provenance, and audit paths, so authorized Wiki search and inspection can use
the same storage as other Raw content. The Agent Memory tables retain only the
namespace-scoped locator/state and idempotency projection.

## Before connecting Hermes

1. Deploy next-wiki normally, enable **LLM Wiki** writing mode so the shared
   Raw space is available, and expose its versioned API through the same
   TLS/reverse proxy used by the Web UI. Remote provider URLs must end in
   `/api/v1` and use HTTPS.
2. Sign in as an administrator, open **User Center → API Keys**, and select
   **Memory provider**. Set a stable non-secret **Agent identity** (normally
   `hermes` for this client). The preset grants only the memory scopes:
   `memory.read`, `memory.write`, and `memory.delete`.
3. Copy the secret once. It is encrypted by next-wiki, can be revealed to its
   owner while active, and can be revoked from the same page.

Do not reuse a general-purpose Wiki key. Do not paste a secret into Wiki help
pages, a shell command, source control, or `next-wiki-memory.json`.

## Install for a Hermes profile

```bash
python -m pip install next-wiki-hermes-memory
hermes memory setup
```

Choose `next-wiki`, enter `https://wiki.example.com/api/v1`, and enter the
secret at the Hermes prompt. Hermes stores the secret as
`NEXT_WIKI_MEMORY_API_KEY`; the provider writes just the non-secret URL,
identity, and capture policy to `$HERMES_HOME/next-wiki-memory.json`.

```bash
hermes memory status
hermes next-wiki status
hermes next-wiki check
```

`status` is offline and never prints a secret. `check` makes the authenticated
diagnostic call and gives repair actions for failed TLS, expired/revoked keys,
missing scopes or binding, redirects, unavailable endpoints, and timeouts. It
does not print raw Wiki response bodies.

For a non-interactive-safe preparation preview:

```bash
next-wiki-hermes-memory init --wiki-url https://wiki.example.com/api/v1 --dry-run
```

The CLI rejects secret arguments. Use Hermes's secure prompt or its managed
environment secret mechanism instead.

## Compatibility

The package is published as a `hermes_agent.memory_providers` entry point. The
upstream MemoryProvider contract was introduced in Hermes `0.7.0`, but that
release was never published to PyPI. CI therefore tests `0.13.0`, the oldest
installable Hermes distribution exposing the contract, and the latest available
Hermes package. The generic Agent Memory API is versioned at
`/api/v1/memory/*`; an incompatible provider or server fails with an actionable
426 response instead of falling back to generic page endpoints.

This is a native Hermes MemoryProvider, not an MCP server or MCP client. The
provider calls the Wiki REST endpoints directly. Hermes uses a generic “Tool
Call” display for both native provider functions and MCP functions, so the
display label alone is not an MCP diagnostic. Native provider tools are named
`next_wiki_memory_*`; an `mcp__`-prefixed name or an entry under `mcp_servers`
indicates that the separate `@next-wiki/mcp-server` integration is active.

Checkpoint API v2 support is runtime-dependent rather than assumed from this
minimum. Keep strict checkpointing disabled until `hermes next-wiki check` and
your Hermes runtime documentation confirm the relevant lifecycle hook.

## Network guidance

| Provider location | URL to configure |
| --- | --- |
| Same host process as development Wiki | `http://127.0.0.1:3000/api/v1` |
| Remote laptop/server | `https://wiki.example.com/api/v1` |
| Separate Docker container | Wiki hostname reachable from that container, preferably through the HTTPS reverse proxy |

`127.0.0.1` inside a container is that container, not the Docker host or
another service. Add DNS/reverse-proxy routing deliberately; do not enable host
networking just for this provider.

The provider sends a `next-wiki-memory/<provider-version>` User-Agent on every
request. If Cloudflare or another edge proxy returns `Error 1010`
(`browser_signature_banned`), this is a transport/WAF block, not a missing
`memory.*` scope. The provider classifies it as `transport_blocked` and omits
the edge response body. Allow the `next-wiki-memory/*` User-Agent or use a
trusted reverse-proxy route; only investigate key scopes after the edge permits
the request through to the Wiki API.

## Capture and checkpoint policy

Explicit saves and recalls are available as namespaced Hermes tools. Automatic
turn capture is off by default, so installing and activating the provider alone
does not archive conversations. Explicit saves remain model-directed and are
available even while capture is disabled.

To enable automatic capture, re-run `hermes memory setup`, select `next-wiki`,
and answer yes to the `capture_enabled` / conversation-capture field. For an
already configured profile, edit only the boolean in
`$HERMES_HOME/next-wiki-memory.json` (inside a container, use the value of
`$HERMES_HOME` in that container; do not assume a host path such as
`/opt/data`). Never put the API key in this JSON file. Restart the Hermes
process or gateway and start a new session, then confirm:

```text
hermes next-wiki status
Capture enabled: yes
```

Each completed eligible turn is queued asynchronously at
`POST /api/v1/memory/evidence`; the response turn is not blocked on the Wiki
worker. Only user and assistant text is submitted. Tool results, tool calls,
system text, and delegated/non-primary contexts are excluded. Verify a test
conversation by checking for the immutable Evidence/Raw entry in the
owner-authorized **Agent Memory** category and an `agent_memory` row in Admin →
Access Log after the worker reports `durable`. `hermes next-wiki check` checks
connectivity and authorization only; it does not prove that a capture was
written.

Strict pre-compression checkpointing is a separate opt-in. Enable it only when
your Hermes runtime supports checkpoint API v2 and your operator accepts that a
worker outage will block lossy compression. Hermes must poll the evidence URL
until its status is `durable`; queued or failed evidence is never a successful
checkpoint. Test resume/compaction behavior whenever you update Hermes.

## Operations

To rotate a key, create a new Hermes preset key, run setup and `check`, then
revoke the previous key. Revoking it immediately rejects new requests. Hermes
forget only marks the logical record forgotten; the immutable Raw entry and its
published revision remain unchanged under the Wiki's Raw retention policy.

Include the normal next-wiki database and content-store backups in your
operational runbook. Memory records, evidence links, and audit entries are
stored there; no separate Hermes service or Docker container is required.

The first-run optional sample pages include an **Agent Memory Guide** at
`/help/agent-memory`, which links users to this workflow without storing any
credentials in the Wiki.
