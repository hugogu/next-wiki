# Agent Context & Memory

**Status**: Constitutionally binding. Elaborates Core Principles P3, P5, P8,
P13, and P14 in `.specify/memory/constitution.md`.

This document defines the architectural boundary for a next-wiki deployment
used by one owner and multiple AI Agents. It covers durable Agent context,
personal and shared memory, Agent configuration, instruction files, and the
subset that an owner deliberately publishes. It does not require a specific
Agent runtime or model provider.

## Purpose and terminology

next-wiki has one owner by default, but that owner MAY operate many Agents.
An **Agent identity** is a server-recognized principal representing one
runtime, profile, or role under that owner. An Agent identity is not a human
user and MUST NOT be inferred from a display name supplied by a client.

A **context item** is a durable, revisioned unit that an Agent may read or
write under policy. At minimum, the system MUST distinguish these kinds:

| Kind | Meaning | Default authority |
| --- | --- | --- |
| `instruction` | Rules and behavior constraints such as an `AGENTS.md` section | Informs behavior; never grants permission |
| `configuration` | Non-secret Agent, runtime, project, or workflow settings | Data; never contains secret values |
| `procedure` | A reusable workflow or Skill description | Data and guidance; execution remains policy-controlled |
| `episodic_memory` | A conversation, event, decision, or interaction record | Evidence or recollection, not an instruction |
| `source_evidence` | Original imported text, files, tool output, or captured material | Canonical evidence |
| `curated_knowledge` | Human-reviewed or approved durable knowledge | Canonical knowledge for its scope |

A **context pack** is a named, inspectable selection of context item revisions
for a target Agent, runtime, project, task, or audience. An **effective context**
is a derived result produced by resolving applicable context packs and items
for one target under permissions, inheritance, precedence, and conflict rules.

## Canonical data and provenance

Context items MUST use the existing page and revision guarantees where those
guarantees apply. A feature MAY store an item body in a page revision or a
purpose-built context record, but it MUST NOT make a free-form Markdown path,
title, or frontmatter convention the only source of its semantic identity.

Each durable context item MUST retain:

- the owner and owning deployment;
- the context kind;
- the contributing human or Agent identity;
- the applicable workspace, project, Agent, Agent group, or task scope;
- the source reference and provenance metadata;
- the immutable revision and content hash;
- its visibility, sharing, and publication state.

Original source evidence MUST remain recoverable when it is captured for
long-term memory. A generated summary, extracted fact, effective context,
embedding, graph, lint result, or recommendation is a derived projection and
MUST be rebuildable from canonical revisions. Generated content MUST cite the
permitted source revisions that support it.

Secret values MUST NOT be stored as context content, Markdown, frontmatter,
audit metadata, logs, exports, or context-pack members. Configuration MAY
contain a typed `SecretRef` or equivalent server-side reference, but resolving
the secret is an explicit runtime operation governed by the owner's policy and
MUST NOT expose the value to retrieval or public publication.

## Identity and scope

Every context read, write, export, synchronization event, and generated
projection MUST have an actor context. The actor context includes the owner,
the Agent identity when applicable, the integration or runtime, and the
requested target scope. A server-side system job MAY act only with a declared,
bounded system scope and MUST preserve the initiating actor for attribution.

The supported scope vocabulary MUST be explicit in the API and permission
model. It SHOULD include:

- owner-private context;
- one Agent's private context;
- a project or workspace context;
- an owner-managed Agent group or shared namespace;
- an explicitly published context pack.

Creating an Agent, connecting an integration, or reading another Agent's
context MUST NOT implicitly grant membership in a shared namespace. A shared
namespace MUST expose its members, read policy, write policy, source Agents,
and current revision state to an authorized owner. The server MUST derive
ownership and scope from the authenticated credential; client-supplied owner,
namespace, or Agent IDs are selectors only and MUST NOT widen access.

Agent-scoped context MAY be copied into a shared context only through an
explicit write, proposal, or publication operation. The operation MUST record
the source Agent and the destination scope. A failed or revoked Agent MUST NOT
retain access through a previously selected namespace or cached permission
decision.

## Effective context assembly

The effective-context compiler MUST perform these stages in order:

1. authenticate the owner, Agent identity, integration, and target runtime;
2. resolve the requested target scope without trusting client ownership claims;
3. filter items by read permission, kind, applicability, lifecycle, and
   publication state;
4. resolve inheritance, precedence, duplicates, and conflicts deterministically;
5. assemble the bounded result for the target's token and runtime limits;
6. return citations, selected revision IDs, omitted-scope information, and the
   compiler policy version.

The exact precedence and conflict behavior MUST be declared by the feature
spec before a context compiler is implemented. A feature MUST NOT rely on
model preference, database row order, upload order, or filesystem traversal
order to resolve competing instructions. The default design direction is
most-specific applicable context before broader defaults, with explicit server
denies always taking precedence; a feature spec MUST state the complete order
and how a conflict is surfaced.

The result MUST be deterministic for the same source revisions, actor, target,
policy version, and compiler version. It MUST be possible to explain why an
item was included, excluded, overridden, or marked as conflicting. Effective
context MUST carry a bounded size policy; silently truncating the highest-
priority instruction is prohibited.

Effective context is a read projection. It MUST NOT mutate source items,
change permissions, promote private content, or publish a page as a side
effect of compilation. Rebuilding it after an index, compiler, or policy
change MUST not alter canonical history.

## Instructions are not authority

Retrieved text is untrusted data unless it is selected as an applicable,
owner-approved instruction revision. Even an approved instruction remains
subject to server policy.

Reading an instruction, configuration value, memory, or source document MUST
NOT:

- grant read, write, delete, publish, or tool-execution permission;
- authorize a tool call or execute a command;
- override the requesting user's or Agent's server-side policy;
- cause an unreviewed page mutation, publication, or secret resolution;
- turn an external document into an instruction without an explicit owner
  action and normal revision/provenance checks.

Instruction-shaped content from external sources MUST be labeled as data and
kept separate from executable runtime policy. Agents and AI models MAY use it
as evidence or a proposal, but the application remains the authority for
permissions, tool policy, review requirements, and mutation boundaries.

## Writes, conflicts, and lifecycle

Agent writes MUST use the same service, validation, permission, revision, and
audit boundaries as human writes. A client MUST NOT write directly to the
database, content store, retrieval index, or another Agent's local source
tree.

Every accepted write MUST be attributable and idempotent where the integration
can retry it. A write that changes durable content creates a new immutable
revision. Metadata-only changes, membership changes, and publication changes
remain transactional domain events and MUST be audited without creating a
duplicate content snapshot.

Concurrent writes MUST either use an explicit base revision and conflict
result, or be serialized by a documented domain policy. Last-write-wins MUST
NOT silently discard a competing instruction, configuration, or memory
revision. Soft deletion and retention rules apply to context items just as
they apply to pages and source evidence.

## Selective publication

Publication is an export boundary, not a visibility shortcut. A publication
operation MUST name the target page, revision, or context pack and MUST record:

- the included item or revision allowlist;
- the audience, scope, or access policy;
- the source and provenance metadata exposed to readers;
- secret-detection and redaction results;
- the approving actor, publication time, and publication version.

The published representation MUST be generated from the selected revisions.
Later private edits MUST NOT silently change a version-pinned pack. Public
indexes, counts, excerpts, backlinks, graph edges, search suggestions, and
cache keys MUST not reveal the existence or content of excluded items.

Withdrawal MUST revoke future authorized reads and invalidate the affected
public routes, data tags, and derived delivery artifacts. Product and API
documentation MUST state that withdrawal cannot remove copies already fetched
or cached by an external Agent or reader.

Public publication of generated knowledge requires the normal review boundary
defined by P2 and P3. A generated conclusion without permitted supporting
evidence MUST remain private or be presented as an explicitly unverified
proposal.

## Integration with Agent instruction files

Files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, and
equivalent runtime manifests are integration formats and MAY be imported,
exported, or used as a local bootstrap pointer. They are not permission
boundaries by themselves.

An integration MUST preserve the distinction between:

- the local file's tool-specific syntax and hierarchy;
- the canonical context items and revisions in next-wiki;
- the generated effective context for one Agent and target;
- a public context pack deliberately exported for others.

Import and synchronization MUST preserve source paths, file identity where
available, revision provenance, and human-maintained content. It MUST NOT
silently overwrite a local instruction file or silently merge conflicting
rules. Tool-specific overrides remain scoped to their target runtime unless an
owner explicitly promotes them to a broader context scope.

## Required verification

Any feature implementing this mandate MUST include tests or documented manual
verification for:

- cross-owner, cross-Agent, and shared-namespace isolation;
- actor attribution and retry idempotency;
- precedence, conflict, omission, and bounded-result behavior;
- proof that retrieval cannot grant authority or execute content;
- secret references and redaction on writes, exports, and logs;
- publication allowlists and absence of metadata leakage;
- revision pinning, withdrawal, cache invalidation, and retained external
  copies;
- import/export behavior for supported instruction-file formats.
