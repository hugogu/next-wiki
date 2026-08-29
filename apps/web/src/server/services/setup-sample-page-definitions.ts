/**
 * Canonical first-run onboarding sample/help page content. The demo seed and
 * the onboarding sample-page writer share these definitions so both produce
 * the same pages; production deployments only get them when the Admin opts in
 * during onboarding (or explicitly enables the demo seed).
 */

/** Marks setup-owned sample content so reruns stay idempotent and
 * user-authored pages at the same paths are detected as collisions. */
export const SAMPLE_PAGE_MARKER = '<!-- next-wiki:sample-page -->';

/** Marks the onboarding "next steps" block appended to an existing welcome
 * page, so enrichment is idempotent. */
export const ONBOARDING_LINKS_MARKER = '<!-- next-wiki:onboarding-links -->';

export const SAMPLE_PAGE_PATHS = {
  welcome: 'welcome',
  markdownSyntax: 'help/markdown-syntax',
  mainFeatures: 'help/main-features',
  agentMemory: 'help/agent-memory-guide',
  hermes: 'integrations/hermes',
  openclaw: 'integrations/openclaw',
} as const;

/**
 * Previous setup-owned location of the (then Hermes-only) integration guide,
 * retained only for an idempotent first-run migration into
 * `SAMPLE_PAGE_PATHS.hermes`. This path can never be reused for a different
 * page afterward: moving a published page's slug away from it (via
 * `updateProperties`) permanently retains it as a redirect alias (see
 * `page-addresses.ts`), so the generic Agent Memory guide below deliberately
 * uses a different canonical path rather than this one.
 */
export const LEGACY_AGENT_MEMORY_PAGE_PATH = 'help/agent-memory';

export const WELCOME_PAGE_TITLE = 'Welcome to next-wiki';
export const MARKDOWN_SYNTAX_PAGE_TITLE = 'Markdown Syntax Guide';
export const MAIN_FEATURES_PAGE_TITLE = 'Main Features Guide';
export const AGENT_MEMORY_PAGE_TITLE = 'Agent Memory Guide';
export const HERMES_PAGE_TITLE = 'Hermes Integration Guide';
export const OPENCLAW_PAGE_TITLE = 'OpenClaw Bridge Guide';

export const WELCOME_PAGE_SOURCE = `# Welcome to next-wiki

This is the first published page. Every page is authored in **Markdown** and rendered to HTML when saved so readers see fast, static-like pages.

## What you can do

| Feature | Editor | Reader | Admin |
| --- |:---:|:---:|:---:|
| Read published pages | ✓ | ✓ | ✓ |
| Draft and edit pages | ✓ | — | ✓ |
| Publish revisions | ✓ | — | ✓ |
| Manage users | — | — | ✓ |

## Markdown support

Pages support standard Markdown plus GitHub-flavored extras such as tables, task lists, fenced code blocks with syntax highlighting, LaTeX math, and Mermaid diagrams.

\`\`\`js
// A small example
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('next-wiki'));
\`\`\`

### Math

Inline math: $E = mc^2$

Block math:

$$
\\int_{0}^{\\infty} e^{-x} \\, dx = 1
$$

### Diagrams

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\`

## Try it out

- Click **New page** to create a draft.
- Use the split editor to write Markdown and preview the result side by side.
- Publish a revision when you are ready to share it.

> **Tip:** Code blocks use language tags like \`js\`, \`ts\`, \`json\`, \`sql\`, \`yaml\`, or \`mermaid\`. LaTeX is wrapped in \`$...$\` or \`$$...$$\`.
`;

export const ONBOARDING_WELCOME_LINKS_BLOCK = `
${ONBOARDING_LINKS_MARKER}

## Next steps

- Learn the syntax in the [Markdown Syntax Guide](/help/markdown-syntax).
- Tour the product in the [Main Features Guide](/help/main-features).
- Connect an external agent securely with the [Agent Memory Guide](/help/agent-memory-guide).
`;

/** Welcome content used when onboarding creates the welcome page itself. */
export const ONBOARDING_WELCOME_PAGE_SOURCE = `${WELCOME_PAGE_SOURCE.trimEnd()}\n${SAMPLE_PAGE_MARKER}\n${ONBOARDING_WELCOME_LINKS_BLOCK}`;

export const MARKDOWN_SYNTAX_PAGE_SOURCE = `# Markdown Syntax Guide

${SAMPLE_PAGE_MARKER}

Every next-wiki page is plain Markdown. This guide demonstrates each supported feature so you can copy the snippets into your own pages.

## Headings

Use one to six \`#\` characters. The first level-1 heading becomes the page title.

## Emphasis

*Italic*, **bold**, ~~strikethrough~~, and \`inline code\`.

## Lists

Unordered:

- First item
- Second item
  - Nested item

Ordered:

1. Draft the page
2. Review the preview
3. Publish the revision

Task lists:

- [x] Write this guide
- [ ] Publish your first page

## Links

Internal pages are linked by path: [Welcome](/welcome) and [Main Features Guide](/help/main-features). External links work too: [CommonMark](https://commonmark.org).

## Images

\`\`\`md
![Alt text describing the image](/api/assets/example.png)
\`\`\`

Upload images with the editor toolbar; they are stored in the configured content backend and rendered inline.

## Tables

| Syntax | Result |
| --- | --- |
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |

## Code blocks

Fenced blocks support syntax highlighting:

\`\`\`ts
export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
\`\`\`

## Math

Inline math: $a^2 + b^2 = c^2$

Block math:

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

## Diagrams

\`\`\`mermaid
flowchart LR
    Draft --> Review --> Publish
    Review --> Draft
\`\`\`

## Blockquotes

> Published pages are cached for fast anonymous reading; publishing a new revision invalidates the cache automatically.
`;

export const MAIN_FEATURES_PAGE_SOURCE = `# Main Features Guide

${SAMPLE_PAGE_MARKER}

next-wiki is an AI-native wiki. This tour covers the core capabilities and where to find them.

## Page authoring

- Create pages from **New page**; every page lives at a stable path like \`help/main-features\`.
- Write in the split Markdown editor with live preview (see the [Markdown Syntax Guide](/help/markdown-syntax)).

## Revision history and publishing

- Saving creates a draft revision; nothing goes live until you publish it.
- Publishing creates an immutable, versioned revision with full history and diffs.
- Readers always see the latest published revision.

## Navigation and search

- The page tree in the sidebar mirrors your page paths.
- Full-text and fuzzy search find pages by title and content.

## AI features (optional)

When an AI provider is configured by an administrator:

- **Wiki chat**: ask questions answered from your wiki content, with citations.
- **Semantic search**: embeddings retrieve related pages even without keyword matches.
- **Image generation**: create illustrations for pages from a prompt.

AI is optional: the wiki is fully usable without it, and every AI feature is permission-scoped.

## Import and export

- Import content from other wiki systems or Markdown archives from the admin transfers screen.
- Export pages for backup or migration.

## Administration

Administrators manage users, AI providers and models, storage backends, site identity, and translations from the **Admin** area.

## Agent memory (optional)

- Read the [Agent Memory Guide](/help/agent-memory-guide) to connect an external agent — [Hermes](/integrations/hermes) or [OpenClaw](/integrations/openclaw) — to a private, Wiki-backed memory destination. Memory entries are immutable and indexed through the same Wiki content pipeline.
- Each connection uses a dedicated credential with only memory scopes; it does not need a Wiki AI provider.

> **Tip:** You can edit or delete this page at any time — it is a normal wiki page created during first-run setup.
`;

export const AGENT_MEMORY_PAGE_SOURCE = `# Agent Memory Guide

${SAMPLE_PAGE_MARKER}

Agent Memory turns this Wiki into durable, inspectable memory for external AI agents and tools. Every memory record is a restricted, immutable Raw Wiki revision, so it carries the same indexing, provenance, and revision history as any other page — nothing is stored outside the Wiki's own content pipeline. Enable **LLM Wiki** writing mode so the shared **Raw** space is available before connecting an agent.

Two adapters are documented today; the underlying **/api/v1/memory** API is shared and versioned, so any client speaking it can integrate the same way:

- [Hermes Integration Guide](/integrations/hermes) — a Python memory provider.
- [OpenClaw Bridge Guide](/integrations/openclaw) — a Gateway plugin for OpenClaw.

## Connections and credentials

Open **User Center → API Keys** and use the **Agent memory connections** section. A **connection** is a stable, revocable identity for one external agent installation (for example, "OpenClaw laptop" or "Hermes prod"); its **credential** is a separate, rotatable secret bound to that connection. Rotating a credential never changes the connection's identity or its memory, and the previous credential keeps working until you explicitly revoke the connection.

Each new connection gets its own **private** memory destination by default — no agent can select or create a shared destination, and no other connection can read it unless an owner explicitly grants access (see Sharing below). A connection's credential secret is shown exactly once at creation or rotation time; copy it into your agent's secret store immediately, since it can never be revealed again afterward.

## Recall, save, and forget

Every connected agent uses the same versioned contract — **POST /api/v1/memory/recall**, **/save**, and **/forget** — scoped automatically to its own connection. Recalled results always include a citation to the exact Wiki revision they came from. Forgetting hides a record from future recall; it never deletes or rewrites the underlying Raw revision, which stays under the Wiki's normal content history.

## Sharing (optional)

Memory is private by default. To share curated context across connections, use the **Deliberate sharing** section in the same User Center page:

1. Create a **shared destination** (a named, owner-controlled collection).
2. **Promote** a specific private or evidence record into it — this makes a separate, independently attributable copy; it never moves or exposes the original record.
3. **Grant** one or more other connections read access to that shared destination.

Revoking a grant takes effect immediately: a request already in flight when the grant is revoked never surfaces the record, and the response looks the same as if the record never existed — no error discloses that access was withdrawn.

## Reference

The full request/response contract for every Agent Memory route, including the ones described above, is published in the [API documentation](/api-docs).
`;

export const HERMES_PAGE_SOURCE = `# Hermes Integration Guide

${SAMPLE_PAGE_MARKER}

This guide covers the Hermes-specific setup steps. For the concepts shared by every adapter — connections, credentials, private-by-default memory, and deliberate sharing — see the [Agent Memory Guide](/help/agent-memory-guide) first.

The Hermes Plugins screen should show **next-wiki** as **ready** and **active** after setup. The API key field is managed by Hermes's secret store; leave it blank when keeping an existing key.

![Hermes Plugins setup for next-wiki](/images/hermes-next-wiki-plugin-setup.png)

## 1. Create a dedicated connection

Open **User Center → API Keys** and use the **Agent memory connections** section to create a connection (set a stable **Agent identity**, e.g. hermes). Keep the shown credential in Hermes's secure prompt or secret store — it can never be shown again after this dialog closes. Never put it in this page, a command-line argument, a shell history, or a normal JSON configuration file.

## 2. Install and activate

~~~bash
python -m pip install next-wiki-hermes-memory
hermes memory setup
hermes memory status
~~~

Select **next-wiki**, enter this Wiki's versioned API URL ending in **/api/v1**, and enter the credential only when Hermes asks for a secret. The provider stores non-secret settings below the active Hermes home directory and keeps capture disabled by default. If you want every eligible user/assistant turn archived as evidence, answer **yes** to the **capture_enabled** conversation-capture field, then restart Hermes and start a new session. Verify **Capture enabled: yes** with **hermes next-wiki status**; **hermes next-wiki check** only checks connectivity and authorization.

For a preview before activation:

~~~bash
next-wiki-hermes-memory init --wiki-url https://wiki.example.com/api/v1 --dry-run
~~~

## 3. Verify safely

~~~bash
hermes next-wiki status
hermes next-wiki check
~~~

**status** never contacts the Wiki and never prints a credential. **check** validates reachability, API version, the connection binding, and granted scopes without returning Wiki content. Automatic capture is asynchronous and excludes tool calls/results, system text, and delegated contexts; inspect the Agent Memory Raw entry and Admin Access Log after the worker reports **durable**. Remote deployments need HTTPS; a Docker-hosted Hermes process must use an address reachable from its own network, not its host-only loopback address.

## 4. Recall, save, capture, and revoke

Hermes can use the **next_wiki_memory_search**, **next_wiki_memory_save**, and **next_wiki_memory_forget** tools. Every recalled item includes a Wiki revision citation. Automatic conversation capture is opt-in and excludes tool results by default. Only enable strict pre-compression checkpoints on a Hermes version that reports support for them.

Rotate the credential from **User Center → API Keys → Agent memory connections** and re-run setup with the new secret, then revoke the connection here once you confirm the new credential works. Revocation stops future access immediately; immutable Raw entries retain their original revisions under the Wiki's Raw retention policy, while Hermes forget only changes provider recall state.

For the complete integration reference, see the [provider README](https://github.com/hugogu/next-wiki/blob/main/packages/hermes-memory-provider/README.md). The [general deployment guide](https://github.com/hugogu/next-wiki/blob/main/docs/deployment.md) covers shared backups and reverse-proxy operations.
`;

export const OPENCLAW_PAGE_SOURCE = `# OpenClaw Bridge Guide

${SAMPLE_PAGE_MARKER}

This guide covers the OpenClaw-specific setup steps. For the concepts shared by every adapter — connections, credentials, private-by-default memory, and deliberate sharing — see the [Agent Memory Guide](/help/agent-memory-guide) first.

The bridge is a hook-only, non-capability OpenClaw plugin: it never claims OpenClaw's exclusive memory slot and coexists with any local memory provider you already run. Local lifecycle hooks (turn/checkpoint/compaction/session end) never block on the Wiki being reachable — they persist to a local outbox first.

## 1. Create a dedicated connection

Open **User Center → API Keys** and use the **Agent memory connections** section to create a connection (e.g. "OpenClaw laptop"). Copy the shown credential into your OpenClaw secret store immediately — it can never be shown again after this dialog closes. Never put it in a committed plugin config file, a command-line argument, or shell history.

## 2. Install and configure

~~~bash
npm install @next-wiki/openclaw-memory-bridge
~~~

Configure the plugin with a secret reference, not a literal credential:

~~~json
{
  "wikiApiBaseUrl": "https://wiki.example.com/api/v1",
  "credential": "\${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}",
  "capture": { "enabled": false, "modes": ["session_end"] },
  "tools": { "enabled": false },
  "sharedRecall": { "enabled": false },
  "promptEnrichment": { "enabled": false }
}
~~~

\`wikiApiBaseUrl\` must end in **/api/v1** and use HTTPS outside local development. Every feature below defaults to **off**; enable only what you need.

## 3. Verify safely

With \`tools.enabled: true\`, ask the agent to check status, or call the **agent_memory_status** tool directly — it never contacts the Wiki and never returns the credential, only whether the bridge is configured and its outbox depth. The bridge never logs a raw memory payload; local outbox entries are capped at 500 per connection (256 KB each) with a 7-day TTL and exponential retry backoff between 5 seconds and 10 minutes.

## 4. Recall, save, capture, and forget

With \`tools.enabled: true\`, the agent can use **agent_memory_search**, **agent_memory_save**, and **agent_memory_forget**; every recalled item includes a bounded, escaped Wiki revision citation. With \`promptEnrichment.enabled: true\`, a second-phase prompt hook injects a few of the most relevant cited memories automatically, without the agent having to call a tool. With \`capture.enabled: true\` and one or more \`capture.modes\` selected, eligible lifecycle turns are captured as evidence automatically and asynchronously — this never blocks the conversation on Wiki availability, and a duplicated or restarted delivery produces at most one durable record.

## 5. Shared recall (optional)

Setting \`sharedRecall.enabled: true\` lets the search tool and prompt enrichment also draw on any shared destination an owner has granted this connection read access to, in addition to its own private memory. Creating shared destinations, promoting records into them, and granting access are owner-only actions performed in **User Center → API Keys → Deliberate sharing** — see the [Agent Memory Guide](/help/agent-memory-guide#sharing-optional). The bridge itself can never create a grant or a shared destination.

## 6. Rotate and revoke

Rotate the credential from **User Center → API Keys → Agent memory connections**, update the plugin's secret reference, and restart the Gateway. Revoke the connection once you confirm the new credential works — revocation stops future access immediately.

For the complete integration reference, see the [plugin README](https://github.com/hugogu/next-wiki/blob/main/packages/openclaw-memory-bridge/README.md).
`;
