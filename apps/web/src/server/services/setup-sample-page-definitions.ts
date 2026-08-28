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
  agentMemory: 'integrations/hermes',
  openclawMemory: 'integrations/openclaw-memory-bridge',
} as const;

/** Previous setup-owned location, retained only for an idempotent first-run migration. */
export const LEGACY_AGENT_MEMORY_PAGE_PATH = 'help/agent-memory';

export const WELCOME_PAGE_TITLE = 'Welcome to next-wiki';
export const MARKDOWN_SYNTAX_PAGE_TITLE = 'Markdown Syntax Guide';
export const MAIN_FEATURES_PAGE_TITLE = 'Main Features Guide';
export const AGENT_MEMORY_PAGE_TITLE = 'Hermes Integration Guide';

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
- Connect Hermes securely in the [Hermes Integration Guide](/integrations/hermes).
- Connect OpenClaw securely in the [OpenClaw Memory Bridge Guide](/integrations/openclaw-memory-bridge).
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

- Use the [Hermes Integration Guide](/integrations/hermes) to connect an agent identity to the shared Raw-space memory destination. Memory entries are immutable and indexed through the same Wiki content pipeline.
- Use the [OpenClaw Memory Bridge Guide](/integrations/openclaw-memory-bridge) to keep OpenClaw's local memory and add cited external recall/capture.
- The integration uses a dedicated API key with only memory scopes; it does not need a Wiki AI provider.

> **Tip:** You can edit or delete this page at any time — it is a normal wiki page created during first-run setup.
`;

export const AGENT_MEMORY_PAGE_SOURCE = `# Hermes Integration Guide

${SAMPLE_PAGE_MARKER}

Use this optional integration to make this Wiki the durable, inspectable memory for one configured agent identity. Hermes is the first supported client. Enable **LLM Wiki** writing mode so the shared **Raw** space is available. Memory records and opted-in conversation evidence are restricted, immutable Raw entries with published revisions and common Wiki indexing/provenance; forgetting only hides a logical record from provider recall and does not change the Raw source.

## 1. Create a dedicated key

Open **User Center → API Keys** and choose the **Memory provider** option. Set a stable **Agent identity** (use hermes for Hermes). Create a new private destination unless you deliberately want to share a destination with another client identity. Grant only the memory scopes you need:

- **memory.read** for recall
- **memory.write** for explicit saves and optional evidence capture
- **memory.delete** for reversible forgetting

Keep the secret in Hermes's secure prompt or secret store. Never put it in this page, a command-line argument, a shell history, or a normal JSON configuration file.

## 2. Install and activate

~~~bash
python -m pip install next-wiki-hermes-memory
hermes memory setup
hermes memory status
~~~

Select **next-wiki**, enter this Wiki's versioned API URL ending in **/api/v1**, and enter the key only when Hermes asks for a secret. The provider stores non-secret settings below the active Hermes home directory and keeps capture disabled by default. If you want every eligible user/assistant turn archived as evidence, answer **yes** to the **capture_enabled** conversation-capture field, then restart Hermes and start a new session. Verify **Capture enabled: yes** with **hermes next-wiki status**; **hermes next-wiki check** only checks connectivity and authorization.

For a preview before activation:

~~~bash
next-wiki-hermes-memory init --wiki-url https://wiki.example.com/api/v1 --dry-run
~~~

## 3. Verify safely

~~~bash
hermes next-wiki status
hermes next-wiki check
~~~

**status** never contacts the Wiki and never prints a key. **check** validates reachability, API version, the key binding, and granted scopes without returning Wiki content. Automatic capture is asynchronous and excludes tool calls/results, system text, and delegated contexts; inspect the Agent Memory Raw entry and Admin Access Log after the worker reports **durable**. Remote deployments need HTTPS; a Docker-hosted Hermes process must use an address reachable from its own network, not its host-only loopback address.

## 4. Recall, save, capture, and revoke

Hermes can use the **next_wiki_memory_search**, **next_wiki_memory_save**, and **next_wiki_memory_forget** tools. Every recalled item includes a Wiki revision citation. Automatic conversation capture is opt-in and excludes tool results by default. Only enable strict pre-compression checkpoints on a Hermes version that reports support for them.

Rotate a key by creating a new dedicated key and re-running setup, then revoke the old key here in User Center. Revocation stops future access immediately; immutable Raw entries retain their original revisions under the Wiki's Raw retention policy, while Hermes forget only changes provider recall state.

For the complete integration reference, see the [provider README](https://github.com/hugogu/next-wiki/blob/main/packages/hermes-memory-provider/README.md). The [general deployment guide](https://github.com/hugogu/next-wiki/blob/main/docs/deployment.md) covers shared backups and reverse-proxy operations.
`;

/** Managed onboarding page for the public OpenClaw adapter. */
export const OPENCLAW_MEMORY_PAGE_TITLE = 'OpenClaw Memory Bridge Guide';
export const OPENCLAW_MEMORY_PAGE_SOURCE = `# OpenClaw Memory Bridge Guide

${SAMPLE_PAGE_MARKER}

The OpenClaw Memory Bridge adds next-wiki as an external, cited memory destination while preserving OpenClaw's native/local memory. The next-wiki server is provider-neutral: each OpenClaw installation uses the same public API and the bridge package performs the OpenClaw-specific adaptation.

## 1. Create a connection and key

An administrator creates a dedicated Agent Memory connection in **User Center → API Keys → Agent memory**. Give each agent its own connection and private destination. Grant only **memory.read** and **memory.write**; add **memory.delete** only when the agent is explicitly allowed to forget records. Sharing is owner-managed through a read or write grant and is never selected by a request body or URL.

Keep the API key in OpenClaw's secret store. Never commit it, place it in a normal JSON file, or pass it on a command line.

## 2. Install the bridge

\`\`\`bash
npm install @next-wiki/openclaw-memory-bridge
openclaw plugins install @next-wiki/openclaw-memory-bridge
\`\`\`

Configure the plugin with this Wiki's HTTPS API URL (for example, \`https://wiki.example.com/api/v2\`) and a secret reference. Enable the plugin's optional tools only after reviewing the host's tool policy. Automatic prompt enrichment is opt-in and requires conversation access plus prompt-injection permission in OpenClaw.

The bridge keeps a bounded, permission-protected local outbox for restart-safe delivery. Hooks enqueue capture work and return quickly; a capture is reported as durable only after the server has written the immutable Raw revision. OpenClaw's local memory remains available if the Wiki is offline.

## 3. Verify and operate

Use the optional \`next_wiki_memory_status\` and \`next_wiki_memory_search\` tools to check connectivity and retrieve cited results. Search results include a stable revision citation. \`next_wiki_memory_save\` and \`next_wiki_memory_forget\` are explicit, approval-gated actions; forgetting only changes recall eligibility and does not delete the immutable Raw source.

The bridge observes \`before_compaction\`, \`after_compaction\`, \`agent_end\`, and session/gateway lifecycle hooks. \`before_compaction\` is not a veto hook, so do not describe it as a hard compaction guarantee. Inspect the bridge diagnostics and the Agent Memory Raw entry when troubleshooting retries or a disabled/revoked connection.

## 4. Import existing local memory (optional)

The companion \`@next-wiki/openclaw-memory-migrate\` package supports a preview → approval → resumable import workflow. It fingerprints eligible Markdown files, never deletes source files, and sends only generic records with \`origin=import\`. Review the preview before approving and keep the migration ledger in the protected OpenClaw plugin data directory.

For security, use HTTPS, rotate keys through User Center, and revoke the connection when an agent is retired. The server rechecks grants and record state for every recall result and returns no details for an inaccessible destination.
`;
