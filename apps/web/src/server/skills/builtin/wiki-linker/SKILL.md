---
name: "wiki-linker"
description: "Turn keywords in a page into links to wiki pages that already explain them. Use when asked to link, cross-link, hyperlink, interlink, or connect a page to the rest of the wiki."
---

# Wiki Linker

Find terms in a page that are already the subject of another wiki page, and
replace the plain text with a Markdown link to it.

That is the whole job. The only thing you produce is edited Markdown:

```text
plain text: We follow the backup policy for all spaces.
linked:     We follow the [backup policy](guides/backup-policy) for all spaces.
```

There is nothing to register. A wiki's link graph — backlinks, related pages,
orphan detection — is derived from the Markdown when a page is read, so editing
the text is the entire change.

## When to use

- "Link the concepts in this page"
- "Cross-link /guides/backup with the rest of the wiki"
- "We mention things that have their own pages but aren't linked"

## The one rule

**Only link a keyword that has an existing, unambiguous, readable target page.**

A keyword with no page stays plain text. A keyword matching several pages stays
plain text. A keyword whose page the user cannot read stays plain text. Inventing
a link is worse than leaving a term unlinked: a broken link erodes trust in every
other link on the page.

## Procedure

### 1. Read the page

`get_page` for the exact source. You need the Markdown, not the rendered text —
the constraints below are about Markdown structure.

### 2. Extract candidate terms

Nouns and noun phrases a reader might want explained: product names, system
names, domain concepts, acronyms. Skip ordinary English.

### 3. Resolve each candidate to a page

`search_wiki` for each candidate, then confirm with `get_page`.

Accept a candidate only when:

- Exactly one page is a genuine match. Several plausible matches means skip it —
  guessing which one the author meant is not your call.
- The match is the concept, not a passing mention. A page that merely uses the
  word is not a page about it.
- You could read the page. If it did not come back, it is not linkable for this
  user.

Use the target page's own path as the link destination, exactly as `get_page`
returned it — for example `guides/backup-policy`. A leading slash is fine and is
ignored; a guessed or prettified path is not.

### 4. Check where the term sits

Never create a link:

- inside an existing link — `[backup policy](/x)` must not become nested;
- inside a code span or a fenced code block — it would change the code;
- inside a heading — headings are anchors, and a link there breaks navigation
  and the table of contents;
- inside a URL, an image reference, or frontmatter;
- inside HTML embedded in the Markdown.

Link the **first** occurrence in the page only. Linking every mention of the
same term turns prose into a link farm.

Never link a page to itself.

### 5. Save the edited Markdown

`save_draft` with the complete updated Markdown. The change lands as a draft
whose diff a reviewer approves or rejects as one unit — and a Markdown diff
already shows each change's keyword, its location, and its target, so no
separate list needs to be filed anywhere.

### 6. Report what you did and did not do

In your answer, give one line per proposed link:

```text
- "backup policy" (first paragraph) → guides/backup-policy
```

Then list what you deliberately skipped and why — ambiguous, no page, inside
code. The skips are the part a reviewer cannot see in the diff, and they are
usually where the interesting judgement was.

## Common mistakes

- Linking a term to a page that only mentions it.
- Linking every occurrence instead of the first.
- Linking inside a code block, which changes what the code says.
- Treating a fuzzy search hit as a match without opening the page.
- Looking for a tool that registers a link. There isn't one, and there does not
  need to be.

See `reference/link-rules.md` for the positional rules in detail.
