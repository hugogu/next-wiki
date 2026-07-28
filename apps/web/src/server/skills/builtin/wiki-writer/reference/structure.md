# Page shapes that work

Reference material for the Wiki Writer skill. These are starting points, not
templates to fill in mechanically — match the wiki you are actually writing in.

## Concept page

```markdown
# <Concept>

One or two sentences that would satisfy someone who only reads the first
paragraph.

## Why it matters

The reason someone would look this up.

## How it works

The mechanism, at the depth the audience needs.

## Related

- [Adjacent concept](/path/to/page)
```

## How-to page

```markdown
# <Task>

## Before you start

Prerequisites, access, anything that will block them halfway through.

## Steps

1. Concrete action.
2. Concrete action.

## If it goes wrong

The two or three failures people actually hit.
```

## Reference page

Lead with the table or list. Prose goes underneath, not above — someone opening
a reference page is looking for a value, not an essay.

## Expanding an existing page

Prefer adding a section to restructuring. A restructure produces a diff nobody
can review, so it needs to be worth it and worth saying out loud.

Good reasons to restructure:

- The page has grown several overlapping sections covering the same thing.
- The heading hierarchy no longer matches the content.

Bad reasons:

- You would have organised it differently.

## Turning a stub into a real page

A stub is usually one paragraph that names the topic. It becomes a real page by
gaining the things a reader came for, roughly in this order of value:

1. **A worked example.** One concrete case, start to finish, with real values.
   This is almost always the highest-value addition and the most often missing.
2. **A diagram** of whatever has parts and relations between them (Mermaid).
3. **A comparison table** if the topic sits among alternatives — what each is
   good at, not just what each is.
4. **The failure modes.** What goes wrong, what it looks like when it does, and
   what to do about it. Pages that only describe the happy path get reread with
   frustration.
5. **Provenance.** Where the numbers come from, when they were measured, and by
   whom.

Sections that add length without adding any of the above — a restated
introduction, a "conclusion" that repeats the opening, a list of buzzwords — make
the page longer and worse.

## Depth by topic type

| The page is about | It needs |
|---|---|
| A concept | A definition, one worked example, and where it does *not* apply |
| A system or architecture | A Mermaid diagram, the responsibility of each part, and the interfaces between them |
| A procedure | Numbered steps, one concrete run-through, and the failure modes |
| A decision | The options considered, the trade-offs, and why the choice was made |
| A reference | The complete table first, prose second, defaults and ranges given |

## Length

Long enough to answer the question, short enough that someone reads it. Depth
comes from examples, diagrams, and data — not from more paragraphs saying the
same thing.

If a page is heading past a screen or two of scrolling, ask whether it wants to
be two pages linked together.
