---
name: "wiki-writer"
description: "Draft a new wiki page or expand an existing one. Use when asked to write, draft, create, expand, flesh out, enrich, improve, deepen, or add detail to a page, or when a page is described as thin, stubby, a stub, or incomplete."
---

# Wiki Writer

Write and expand wiki pages so the result reads like the rest of the wiki, is
concrete rather than abstract, and lands as a reviewable draft.

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

### 3. Expand — do not rewrite

You are extending a document someone already wrote. Carry forward, verbatim
unless it is wrong:

- every existing image reference,
- every external link and citation,
- every claim, figure, and example that is still correct,
- the page's own vocabulary for its subject.

Losing any of these is the most common way an "improved" page ends up worse
than the original. Rewriting a passage that was already fine also destroys
review signal — the diff should show what you actually changed.

If the original is scattered notes, reorganise it into a proper structure, but
every fact in the notes must survive the move.

### 4. Make the abstract concrete

This is what separates a page worth reading from a summary of a summary. For
each kind of content, do the second thing, not just the first:

| Content | Not enough | Do this |
|---|---|---|
| A formula | State it | State it, then walk one worked example with real numbers |
| An architecture or model | Describe it in prose | Add a Mermaid diagram of the parts and their relations |
| An algorithm or process | Name the steps | Number the steps, then show one concrete input and its output |
| An abstract theory | Define it | Add an analogy, where it came from, and where it is actually used |
| A comparison or claim | Assert it | Put the numbers in a table and say where they came from |
| A parameter or setting | List it | Give its default, its range, and what breaks at each extreme |
| A scene, object, or artwork | Describe it | Generate an illustration (see below) |

A page that defines terms and never shows one in use has not explained
anything.

### 5. Write

For a new page, `create_page` with `path`, `title`, and `contentSource`. For an
existing one, `save_draft` with `pageId` and the **complete** replacement
Markdown — not a fragment, not a diff.

Follow `reference/formatting.md` for the syntax this wiki actually renders.
Three rules matter most because getting them wrong is silent:

- **Diagrams are Mermaid.** Never draw with text characters — no ASCII art, no
  box-drawing, no aligned pipes pretending to be a diagram.
- **Maths is KaTeX** in `$…$` / `$$…$$`, never inside a code fence.
- **Structure gets a diagram, not a picture.** Generate an illustration only
  for something a picture can show that prose cannot — a scene, an object, an
  artistic or historical subject. Architectures, flows, and comparisons want
  Mermaid or a table, which stay accurate and searchable.

### Illustrating a page

`generate_image` → `promote_generated_image` → `save_draft`, in that order.
The first two never touch the page; the Markdown only lands when you save the
draft yourself. A generated artifact is private and expires, so it must be
promoted before it can be referenced.

`generate_image` derives its prompt from the page or from a passage you select
out of the current revision — there is no free-text prompt. Steer the picture by
choosing the passage, not by describing it separately. `reference/formatting.md`
has the exact arguments and the aspect ratios.

Replace the placeholder `image` alt text that promotion returns with a real
description before putting it in the page.

### 6. Ground it

Prefer facts you can point at — pages you read, tool results you received.
Where you are inferring or generalising, say so in the text. Cite sources for
figures and benchmark numbers; an unsourced number is worse than no number,
because the reader cannot check it.

A confidently wrong wiki page is worse than a short one.

### 7. Report

After a successful `create_page`, include the returned title and href as a
Markdown link in your answer. Say plainly what you added, what you left alone,
and anything you deliberately did not do — a section you could not source, a
figure you could not verify.

## Common mistakes

- Calling `save_draft` for a page that does not exist yet. Use `create_page`.
- Sending a partial body to `save_draft`. It replaces the whole page.
- Dropping the original's images or links while "improving" it.
- Padding length with restatement. Another paragraph saying the same thing is
  not depth; a worked example is.
- Inventing an image URL. Reference an image the page already has, or create
  one with `generate_image` + `promote_generated_image`; never write a URL you
  did not get back from one of those.
- Leaving the placeholder `![image](…)` alt text that promotion returns.
- Generating a picture of an architecture or a flow. That is a Mermaid diagram.
- Including YAML frontmatter without a non-empty `type` field. Omit the
  frontmatter block entirely if you are unsure.

See `reference/structure.md` for page shapes and `reference/formatting.md` for
the exact syntax this wiki renders.
