# MCP Tool Contract: Wiki MVP Foundation

This document defines the optional MCP tool surface for AI coding tools and
other agent-based consumers. All tools use the same permission model as the
main application and public API.

## Tool: `wiki_search`

- Purpose: Search readable wiki content by keyword.
- Inputs:
  - `query`
  - `space` (optional)
  - `tag` (optional)
  - `locale` (optional)
  - `limit` (optional)
- Output:
  - Matching page summaries with canonical path, title, locale, snippet, and
    permission-safe ordering

## Tool: `wiki_get_page`

- Purpose: Retrieve a page in source, rendered, or summary form.
- Inputs:
  - `space`
  - `path`
  - `locale` (optional)
  - `format` (`source`, `rendered`, `summary`)
- Output:
  - Page metadata, current revision number, requested content format, and tags

## Tool: `wiki_get_revision_history`

- Purpose: Inspect revision history for a page.
- Inputs:
  - `pageId`
  - `limit` (optional)
- Output:
  - Revision numbers, timestamps, authors, and change summaries

## Tool: `wiki_list_tags`

- Purpose: List tags globally or within a space.
- Inputs:
  - `space` (optional)
  - `query` (optional)
- Output:
  - Tag identifiers, labels, and optional usage counts

## Tool: `wiki_create_draft`

- Purpose: Create a draft page through an agent-safe write path.
- Inputs:
  - `space`
  - `path`
  - `title`
  - `sourceContent`
  - `locale`
  - `tags` (optional)
  - `draftNote` (optional)
- Output:
  - Draft page identifier, canonical path, and current revision number

## Tool: `wiki_update_draft`

- Purpose: Update an existing draft page while creating a normal revision.
- Inputs:
  - `pageId`
  - `sourceContent`
  - `title` (optional)
  - `tags` (optional)
  - `changeSummary` (optional)
- Output:
  - Updated draft metadata and new revision number

## Tool: `wiki_move_page`

- Purpose: Move a page to a new canonical path or space.
- Inputs:
  - `pageId`
  - `newPath`
  - `destinationSpace` (optional)
- Output:
  - Updated canonical path and redirect creation result

## Tool: `wiki_ask`

- Purpose: Ask a grounded question against readable wiki content.
- Inputs:
  - `question`
  - `space` (optional)
  - `path` (optional)
  - `conversationId` (optional)
- Output:
  - Answer text
  - Citation list with page paths and revision identifiers
  - Conversation identifier for follow-up

## Tool: `wiki_get_job_status`

- Purpose: Inspect long-running task status.
- Inputs:
  - `jobId`
- Output:
  - Task type, status, progress label, timestamps, and failure summary if present

## Tool Rules

- Read tools return only content the caller is allowed to read.
- Write tools require write permission and create normal page revisions.
- AI tools must return citations for substantive answers.
- Tool calls must not bypass draft flow, revision history, permission checks, or
  move/redirect rules.
