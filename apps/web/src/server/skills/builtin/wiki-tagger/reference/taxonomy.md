# Tag families that tend to work

Reference material for the Wiki Tagger skill.

A tag is worth having if someone would plausibly filter by it. Test each
candidate against that before proposing it.

## Families

| Family | Answers | Examples |
|---|---|---|
| Domain | What area of the system? | `payments`, `auth`, `search` |
| Kind | What sort of document? | `how-to`, `reference`, `decision`, `postmortem` |
| Lifecycle | How much should I trust this? | `draft`, `current`, `deprecated` |
| Audience | Who is it for? | `internal`, `onboarding` |

Most pages want one Domain tag, one Kind tag, and a Lifecycle tag only when it
is not the default.

## Naming

- Lowercase, hyphenated: `how-to`, not `How To` or `how_to`.
- Singular unless the plural is what people say: `guide`, but `metrics`.
- No redundant prefixes: `payments`, not `topic-payments`.

## Tags that are not worth having

- Ones that apply to everything: `wiki`, `documentation`, `page`.
- Ones that apply to exactly one page — that is what the title is for.
- Ones that restate the path. If the page lives under `/guides/`, it does not
  also need a `guides` tag.
- Dates and versions. Those belong in metadata, not in the tag vocabulary.

## Consolidating

When you find near-duplicates:

1. Decide which name survives. Usually the one with more pages, unless the other
   is clearly better named.
2. `merge_tag` the loser into the survivor. This preserves every association in
   one reviewable operation.
3. Do not delete-then-retag. It produces a much larger change for the same
   outcome, and every page it misses silently loses its tag.
