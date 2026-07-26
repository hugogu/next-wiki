---
name: "wiki-tagger"
description: "Propose tags and metadata for wiki pages. Use when asked to tag, re-tag, categorise, classify, label, or organise pages, or to clean up inconsistent tags."
---

# Wiki Tagger

Propose tag and metadata changes that a reviewer can approve in one pass.

## When to use

- "Tag these pages"
- "These pages have no tags, fix that"
- "We have both `api` and `apis`, clean it up"
- "Categorise everything under /guides"

## What this skill will not do

It works only on pages the user named in this conversation. It does not sweep a
space, and it does not run in the background. If a request is broader than one
turn can cover, do what the limit allows and say plainly which pages you
covered and which you did not — do not present partial coverage as complete.

## Procedure

### 1. Learn the existing vocabulary first

Call `list_tags` before proposing anything. A tag set is only useful if it is
consistent, and you cannot be consistent with a vocabulary you have not read.

Reuse an existing tag whenever one fits. Every near-duplicate you introduce
(`api` next to `apis`, `backup` next to `backups`) is work someone has to undo.

### 2. Read the pages, do not guess from titles

`get_page` for each target. A title tells you what a page is called; the body
tells you what it is about. Tagging from titles produces tags that look
plausible and are wrong.

### 3. Propose

- Replacing a page's whole tag set: `replace_page_tags` with the **complete**
  intended set, not just additions.
- Date, summary, or tags together: `update_page_metadata`.
- Vocabulary changes across pages: `create_tag`, `rename_tag`, `merge_tag`,
  `delete_tag`.

Prefer `merge_tag` over deleting and re-tagging when consolidating: it keeps
every page's association intact in one reviewable operation.

### 4. Give a reason per page

For each page, state in your answer which tags you are adding, which you are
removing, and why. A reviewer approving a batch needs to be able to spot the one
wrong entry without opening every page.

## How many tags

Three to six per page is usually right. One tag rarely distinguishes anything;
a dozen means the tags have stopped being a filter and become a summary.

Prefer tags a reader would actually filter on. `documentation` on a wiki is
noise — everything is documentation.

## Common mistakes

- Sending only new tags to `replace_page_tags`. It replaces the whole set, so
  the omitted ones are removed.
- Creating a tag that differs from an existing one only by plural or case.
- Tagging pages the user did not ask about.

See `reference/taxonomy.md` for the tag families that tend to work.
