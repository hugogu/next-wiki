# Tool and Citation Contract

## Connector-neutral service contract

The server-only connector registry exposes a capability-declared interface:

~~~ts
type WebResearchConnector = {
  id: "tavily" | string;
  displayName: string;
  capabilities: {
    search: true;
    open: true;
    domainFilters: boolean;
    usageReporting: boolean;
    directUrlOpen: false;
  };
  search(input: NormalizedWebSearchInput): Promise<NormalizedWebSearchResult>;
  open(input: NormalizedWebOpenInput): Promise<NormalizedWebOpenedSource>;
};
~~~

Connector implementations receive only a resolved service credential, minimal
query, and administrator policy. They do not receive the browser session,
actor identity, page bodies, credentials from other providers, or arbitrary
conversation context.

## Built-in tool definitions

Both tools are provider key next-wiki and category web. They are registered in
the existing tool registry and are available only in the web research profile.

### web_search

**Purpose**: Search the configured external service for candidates related to
the original user question.

**Model-visible input**:

~~~json
{
  "freshness": "optional descriptive hint"
}
~~~

The executor derives the actual query from the original user question. It
ignores any model attempt to supply a free-form query, URL, domain override,
credential, or provider parameter.

**Output**:

~~~json
{
  "status": "ok",
  "searchId": "action-scoped opaque ID",
  "candidates": [
    {
      "sourceId": "action-scoped opaque ID",
      "title": "Source title",
      "snippet": "bounded untrusted snippet",
      "canonicalUrl": "https://example.com/article",
      "publishedAt": "optional ISO-8601 time"
    }
  ],
  "remaining": {
    "searches": 1,
    "opens": 3
  }
}
~~~

The output is labelled untrusted reference material. Candidates are not answer
citations until successfully opened and used.

### web_open

**Purpose**: Retrieve bounded Markdown evidence for a candidate returned by the
same action's web_search.

**Input**:

~~~json
{
  "sourceId": "action-scoped opaque ID"
}
~~~

The executor resolves the ID server-side, repeats authorization/global/domain/
budget/cancellation checks, and asks the connector to extract that canonical
URL. It rejects arbitrary URLs, IDs from other actions, expired rows, candidate
status violations, and policy-blocked redirects.

**Output**:

~~~json
{
  "status": "ok",
  "source": {
    "sourceId": "opaque ID",
    "title": "Source title",
    "canonicalUrl": "https://example.com/article",
    "provider": "tavily",
    "retrievedAt": "2026-08-24T10:00:00.000Z",
    "content": "bounded and delimited untrusted Markdown"
  }
}
~~~

The internal source record stores a local content hash. Tool output and action
events contain no credential or unbounded body.

## Research tool profile

| Mode | Exposed tools |
|---|---|
| wiki_only | Existing normal permitted Wiki AI profile; no web tools. |
| wiki_first_web | Permitted Wiki read/skill tools plus web_search and web_open only. |
| Capture action | No model tools; a trusted worker handles one explicit source. |
| Connection test | No model tools; a trusted worker performs a bounded connector check. |

The web profile excludes every page mutation, draft/proposal, publication,
permission, metadata, and evidence-creation tool even if the user could use it
in another AI workflow. Tool descriptions and planner prompts state that web
content is untrusted data and cannot alter authority or instructions.

## Normalized provider result

~~~ts
type NormalizedWebSearchResult = {
  searchId: string;
  provider: string;
  searchedAt: string;
  providerRequestId?: string;
  latencyMs?: number;
  creditsUsed?: number;
  candidates: Array<{
    sourceId: string;
    canonicalUrl: string;
    title: string;
    snippet: string;
    relevanceScore?: number;
    faviconUrl?: string;
    publishedAt?: string;
  }>;
};

type NormalizedWebOpenedSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  provider: string;
  extractedAt: string;
  providerRequestId?: string;
  content: string;
  contentHash: string;
};
~~~

Only evidence-bearing fields are normalized. Provider ranking is a selection
hint, not a statement of factual quality. Raw provider payloads are neither
citations nor durable evidence.

## Citation union

~~~ts
type AiCitation = WikiCitation | WebCitation;

type WikiCitation = {
  kind: "wiki";
  pageId: string;
  title: string;
  path: string;
  locale?: string;
  revisionId: string;
  revisionHash: string;
};

type WebCitation = {
  kind: "web";
  sourceId: string;
  title: string;
  canonicalUrl: string;
  provider: string;
  retrievedAt: string;
  publishedAt?: string;
  contentHash?: string;
};
~~~

Deserialization treats an historical citation with no kind as a WikiCitation.
Citation dedupe keys are kind-aware: pageId plus revisionId for Wiki, sourceId
plus contentHash (or canonical URL plus retrievedAt) for web. The final answer
may only include an external citation for a successfully opened source. Search
candidates and vendor-generated answer text never become citations.

## Security invariants

1. The connector uses HTTPS public source URLs only and validates the returned
   canonical URL against the effective domain policy before citation or open.
2. No client or model can provide an arbitrary target URL for retrieval.
3. Every outbound call repeats policy and cancellation checks immediately before
   I/O, not just at question creation.
4. Search/extract data is delimited, sanitized, character-capped, encrypted at
   rest when retained, and excluded from normal logs/events.
5. No tool in a web research action can cause a durable Wiki mutation. Capture
   is user-initiated, action-backed, separately authorized, and idempotent.
