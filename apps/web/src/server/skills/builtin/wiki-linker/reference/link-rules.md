# Where a link may and may not go

Reference material for the Wiki Linker skill. Every rule here exists because
breaking it produces a page that is worse than the unlinked original.

## Never link inside

| Context | Example | Why |
|---|---|---|
| An existing link | `[the backup policy](/x)` | Nested links are invalid Markdown and render unpredictably. |
| A code span | `` `backup policy` `` | It would change what the code says. |
| A fenced block | ```` ```…``` ```` | Same, and it usually breaks the sample. |
| A heading | `## Backup policy` | Headings are anchor targets; a link there breaks deep links and the table of contents. |
| A URL or image | `https://x/backup-policy` | It would corrupt the reference. |
| Frontmatter | `tags: [backup-policy]` | Frontmatter is data, not prose. |
| Embedded HTML | `<span>backup policy</span>` | Mixing Markdown links into raw HTML is unreliable. |

## Occurrences

Link the first occurrence in the page. Not every occurrence.

Rationale: the link is there so a reader who does not know the term can go find
out. They need that once. Repeating it turns body text into a link farm and
makes the genuinely important links harder to spot.

Exception worth taking: a very long page where the term reappears many screens
later, under a different heading, is fair to link a second time.

## Matching

- Case-insensitive, but preserve the text as written. `Backup Policy` in the
  page stays `Backup Policy` inside the link.
- Whole words only. `backup` must not match inside `backups-legacy`.
- Prefer the longest match. If both `backup` and `backup policy` have pages and
  the text says "backup policy", link the longer one.

## Ambiguity

Two or more genuine candidates means skip and say so. Picking one is a guess
dressed up as a decision, and the reviewer has no way to see that you guessed.

## Self-links

Never link a page to itself. Check the target against the page you are editing
before proposing.

## Density

If a paragraph is heading past three or four links, stop. Past that point the
links stop helping and start competing with the sentence.
