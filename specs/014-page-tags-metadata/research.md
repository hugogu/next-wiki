# Research: Page Tags and Metadata

## R1 — Metadata authority and synchronization

**Decision**: Raw Markdown remains portable source. A write-time validator
parses supported `title`, `date`, `tags`, and `summary`, saves a typed revision
snapshot, and serializes the resolved values into frontmatter while preserving
unrelated keys and body content.

**Rationale**: Existing reads parse permissive frontmatter, but typed snapshots
make reader/list/query behavior stable and respect immutable revisions.

**Alternatives considered**: Frontmatter-only was rejected for query and
lifecycle reliability; database-only was rejected because it breaks portable
Markdown workflows.

## R2 — Tag identity and revision history

**Decision**: Add a space-scoped tag registry (`name`, normalized name, stable
ID, soft-retirement) and revision-level tag snapshots carrying the label at the
time of the revision. Current public tags are resolved from the published
revision; historical revisions keep their original values.

**Rationale**: A registry prevents spelling variants and gives API/MCP stable
identities. Revision snapshots keep past content self-describing after rename
or deletion.

**Alternatives considered**: String arrays alone cannot support safe global
rename/delete; a current assignment only loses historical state.

## R3 — One metadata-aware revision writer

**Decision**: Create one shared writer for editor saves, typed metadata edits,
public batch frontmatter changes, and tag jobs. It validates/merges source,
performs stale checks, renders the Markdown body without valid frontmatter, and
writes revision, metadata, and tags atomically before existing post-commit
replication/export/index work.

**Rationale**: Existing normal and public batch write paths are separate;
centralization prevents them from drifting.

**Alternatives considered**: Updating metadata after a revision or patching
each writer independently both permit inconsistent state.

## R4 — Rendering and summary projections

**Decision**: Extract a shared frontmatter splitter into a content/pipeline
utility. Render only the valid-frontmatter body while retaining raw source for
storage, hashes, editing, API source responses, and export. Extend the shared
published-page summary projection with summary/fallback excerpt; homepage and
`/pages` consume it while search retains relevance excerpts.

**Rationale**: The current renderer receives raw Markdown, so YAML can appear
in article content. Reader-local stripping would leave preview and stored HTML
inconsistent. Shared list projection prevents per-card fetches.

## R5 — Fan-out tag lifecycle

**Decision**: Create/list tags are request operations. Rename/delete persist a
tag-mutation operation and execute via pg-boss. The worker locks the tag and
affected pages, writes synchronized revisions, and reports completion only
after all pages converge.

**Rationale**: Cross-page operations can exceed 500 ms and current batch update
permits partial success, contrary to the synchronization requirement.

**Alternatives considered**: Synchronous looping violates the async rule;
reusing per-item batch update cannot guarantee all-or-nothing convergence.

## R6 — Additive REST/MCP and permissions

**Decision**: Preserve `frontmatter`, `filter[tag]`, generic page PATCH, and
MCP `filterTag`. Add optional typed metadata, a dedicated page metadata
resource, tag collection/item resources, mutation status, and MCP equivalents.
Reads use `view`, page metadata writes use `edit`, and tag lifecycle gets a
new admin-only `manage_tags` permission/scope.

**Rationale**: Existing REST exposes raw frontmatter/filtering but no stable
metadata or tag-lifecycle contract; MCP drops metadata on several responses.

**Alternatives considered**: Replacing raw frontmatter is breaking; ordinary
page edit permission is not sufficient for a global tag rename/delete.
