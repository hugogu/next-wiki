# Research: Wiki MVP Foundation

## Decision: Establish the full MVP persistent domain model in the first schema release

**Rationale**: The spec explicitly requires that all MVP features needing
persistent tables exist from the start so operators get a stable initialization
path. This means the first schema includes identity, sessions, external auth
links, groups, permissions, spaces, pages, revisions, redirects, outbound
links, tags, assets, themes, AI providers, AI conversations, AI knowledge
records, and background task visibility.

**Alternatives considered**:

- Add tables only as implementation stories arrive: rejected because it creates
  repeated migration churn and breaks the “stable MVP DB foundation” goal.
- Design a much larger future-proof schema for non-MVP capabilities: rejected
  because it introduces low-confidence complexity outside the current scope.

## Decision: Use Better Auth with local accounts plus optional enterprise providers

**Rationale**: The constitution locks in local auth as the baseline and allows
federated auth through OAuth2/OIDC with enterprise feature specs for additional
protocols. The current constitution also explicitly names Better Auth, so the
plan includes local credentials, OIDC providers, LDAP, and SAML as
administrator-configurable identity paths backed by the same local user record
model.

**Alternatives considered**:

- Ship local auth only and defer all enterprise providers: rejected because the
  spec now explicitly requires configurable OAuth2/OIDC, LDAP, and SAML support.
- Represent external identities without creating local user records: rejected
  because it weakens permissions, auditing, authorship, and revision history.

## Decision: Enforce a single permission engine across web, search, redirects, AI, and APIs

**Rationale**: The constitution defines a precise precedence chain and forbids
hidden bypass paths. The plan therefore centralizes permission evaluation in the
service layer and passes explicit permission context into page reads, search,
redirect resolution, AI retrieval, and external API access.

**Alternatives considered**:

- Let each API or feature layer implement its own permission logic: rejected
  because it causes divergence and makes correctness impossible to reason about.
- Add an administrator-only bypass branch in data queries: rejected because it
  violates the constitution and creates hard-to-audit behavior.

## Decision: Use PostgreSQL full-text search as the default discovery engine

**Rationale**: The constitution requires search indexing on save and keeps
PostgreSQL as the only required stateful dependency. PostgreSQL `tsvector`
search satisfies MVP keyword discovery, search permission filtering, and a
baseline retrieval signal for AI without adding another required service.

**Alternatives considered**:

- Require Meilisearch or Elasticsearch from day one: rejected because it breaks
  the deployment baseline.
- Postpone search until after authoring is stable: rejected because search is a
  core wiki feature and also feeds AI retrieval grounding.

## Decision: Track internal links and redirects as first-class wiki data

**Rationale**: Wiki behavior differs from ordinary document rendering because
pages reference one another as addressable knowledge nodes. Persisting outbound
link records and explicit redirects enables broken-link detection, backlinks,
path moves, and permission-aware redirect behavior.

**Alternatives considered**:

- Only resolve links at render time without storing relationship data: rejected
  because it prevents backlink support and makes broken-link detection costly.
- Handle page moves by rewriting content inline everywhere: rejected because it
  is fragile and still does not replace redirect semantics.

## Decision: Model multilingual content as localized page records linked by translation group

**Rationale**: The constitution explicitly defines path-neutral pages with
localized records linked through `translation_group_id`. This preserves one
canonical path shape while allowing independent permissions and fallback
behavior per locale.

**Alternatives considered**:

- Encode locale into the page path: rejected because it violates the
  constitution and complicates hierarchy rules.
- Treat translations as one page with language blobs inside it: rejected because
  it weakens independent permissions and revision tracking.

## Decision: Keep Markdown as the sole primary source format and extend it through the rendering pipeline

**Rationale**: The MVP must support Markdown plus Mermaid, LaTeX, draw.io, link
processing, and sanitization while preserving raw source fidelity for history
and export. A structured render pipeline lets those behaviors compose cleanly.

**Alternatives considered**:

- Store rendered HTML as the canonical content body: rejected because it weakens
  revisions, portability, and plugin evolution.
- Introduce multiple primary editor formats in MVP: rejected because it adds
  schema and UX complexity before the base wiki loop is stable.

## Decision: Store draw.io diagrams as wiki-managed artifacts referenced from page source

**Rationale**: The MVP needs durable draw.io support but not advanced
collaborative diagram editing. Treating diagrams as referenced artifacts keeps
them inside backup/restore flows and allows source-preserving revisions.

**Alternatives considered**:

- Provide a full in-product collaborative draw.io editor in MVP: rejected
  because it expands scope well beyond the required foundation.
- Support draw.io only through third-party embeds: rejected because it weakens
  portability and content ownership.

## Decision: Make themes structured token sets that map to CSS custom properties

**Rationale**: The spec now explicitly requires a WordPress-like style system
and the constitution requires style independence through tokenized CSS custom
properties. Theme records therefore contain structured tokens and chrome
settings, while the application shell reads them into a consistent visual
surface.

**Alternatives considered**:

- Ship one fixed docs theme with hardcoded values: rejected because it violates
  the constitution and blocks site identity control.
- Allow arbitrary custom CSS as the primary theming mechanism: rejected because
  it weakens predictability, supportability, and accessibility in MVP.

## Decision: Provide three interface layers from the start: internal tRPC, public REST, optional MCP

**Rationale**: The constitution fixes this API architecture. Internal typed APIs
support fast product development, public REST supports external integrations,
and MCP supports AI tooling under the same service layer and permission rules.

**Alternatives considered**:

- Ship only the internal API and design the public API later: rejected because
  it would delay stable integration design.
- Use REST for all first-party and third-party interactions: rejected because it
  slows internal product work and duplicates contracts.

## Decision: Deliver AI as an optional, persistent, permission-scoped chat surface

**Rationale**: The constitution now requires a persistent AI chat side pane when
AI is enabled. The plan therefore uses provider configuration, derived
knowledge records, persistent conversations, citations, and normal draft flows
for generated content.

**Alternatives considered**:

- Expose AI only through page-level buttons or isolated features: rejected
  because it conflicts with the constitution's first-class chat requirement.
- Keep AI chat stateless: rejected because it loses context continuity,
  traceability, and administrative oversight.

## Decision: Run all expensive work through background jobs with user-visible status

**Rationale**: The constitution explicitly prohibits synchronous LLM work in
request handlers and requires immediate job identifiers for long-running tasks.
The plan therefore treats AI inference, indexing, bulk imports, restores, and
search rebuilds as background tasks with visible state.

**Alternatives considered**:

- Allow synchronous AI answering in page requests: rejected because it violates
  the constitution and creates unstable user experience.
- Hide background work from operators and users: rejected because the spec
  requires visibility into task status, progress, and outcomes.
