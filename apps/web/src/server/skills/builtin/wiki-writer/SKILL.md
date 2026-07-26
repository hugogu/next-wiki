---
name: "wiki-writer"
description: "Draft a new wiki page or expand an existing one. Use when asked to write, draft, create, expand, flesh out, enrich, or add detail to a page, or when a page is described as thin, stubby, or incomplete."
---

# Wiki Writer

Write and expand wiki pages so the result reads like the rest of the wiki and
lands as a reviewable draft.

## When to use

- "Write a page about X"
- "This page is too thin, expand it"
- "Add a section on Y to /guides/backup"
- "Turn what we just discussed into a page"

## What this skill will not do

It never publishes. Every change becomes a draft or a proposed revision, which
someone with permission then reviews. If you find yourself looking for a way to
publish directly, the answer is that there isn't one and shouldn't be.

## Procedure

### 1. Find the target before writing anything

Use `search_wiki`, then `list_pages` or `get_page` for an exact path. Do not
guess a path — a guessed path either fails or creates a duplicate page, and the
second is worse than the first.

- The page exists → note its `pageId` and read its current source.
- The page does not exist → decide where it belongs from the surrounding tree
  (`get_neighborhood` on the nearest parent) rather than inventing a location.

### 2. Read the neighbourhood, not just the page

Expanding a page well means matching what is around it: heading depth, whether
pages use frontmatter, how they open, whether they link out. Read one or two
sibling pages before writing.

### 3. Write

For a new page, `create_page` with `path`, `title`, and `contentSource`. For an
existing one, `save_draft` with `pageId` and the **complete** replacement
Markdown — not a fragment, not a diff.

When expanding:

- Keep everything that is still correct. Rewriting a passage that was fine
  destroys review signal: the diff should show what you actually changed.
- Add what is missing rather than restating what is there.
- If the existing text contradicts what you learned, say so in your answer
  instead of quietly overwriting it.

### 4. Ground it

Prefer facts you can point at — pages you read, tool results you received. Where
you are inferring or generalising, say so in the text. A confidently wrong wiki
page is worse than a short one.

### 5. Report

After a successful `create_page`, include the returned title and href as a
Markdown link in your answer. Say plainly what you changed and what you left
alone.

## Common mistakes

- Calling `save_draft` for a page that does not exist yet. Use `create_page`.
- Sending a partial body to `save_draft`. It replaces the whole page.
- Including YAML frontmatter without a non-empty `type` field. Omit the
  frontmatter block entirely if you are unsure.
- Expanding a page nobody asked you to touch.

See `reference/structure.md` for page shapes that work well.
