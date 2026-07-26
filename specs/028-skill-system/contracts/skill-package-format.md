# Contract: Skill Package Format & Loading

**Satisfies**: FR-012, FR-013a, FR-014, FR-018 – FR-020, FR-023, FR-025,
FR-028 – FR-030, FR-039 – FR-044, SC-007

---

## 1. Package layout

```text
<package-root>/
├── SKILL.md          # required
├── reference/        # optional
└── scripts/          # optional — reference material, never executed
```

`SKILL.md`:

```markdown
---
name: wiki-linker
description: Convert keywords in a page that already have wiki pages into links. Use when asked to link, cross-link, or hyperlink a page.
---

# Wiki Linker

## When to use
…

## Procedure
1. …
```

This is the published Anthropic skill layout, unchanged, so a skill authored for
another Claude-based tool loads without conversion (P9).

---

## 2. Validation

| Field | Rule | Failure reason |
|---|---|---|
| `SKILL.md` | present, readable, parseable frontmatter | `missing_instruction_file` / `invalid_frontmatter` |
| `name` | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars | `invalid_frontmatter` |
| `description` | 1–1024 chars after trim | `invalid_frontmatter` |
| package size | ≤ 1 MiB total, ≤ 16 files | `too_large` / `too_many_files` |
| file size | ≤ 64 KiB for viewable text | listed as `viewable: false` |
| paths | resolve inside the package after symlink resolution | `path_escape` |

`name` is the canonical identity (FR-013a). A directory whose name disagrees with
the declared `name` loads under the declared name and reports the mismatch.

---

## 3. Loading contract (the P10 bounded registry)

```text
buildRegistry():
  entries = []
  rejected = []

  for pkg in BUILTIN_SKILL_PACKAGES          # explicit list in code, not scanned
      overlay any `builtin` override row
      register(pkg)

  for row in managed skills (deleted_at is null, by created_at)
      register(row)

  if SKILLS_BASE_PATH configured and readable:
      for dir in one-level children (max 100, by directory name):
          pkg = parse(dir)                    # validation table above
          register(pkg) or rejected.push(reason)
  else:
      notice = 'skills directory not configured / missing / unreadable'

  register(x):  first claim of a name wins;
                a later claim becomes rejected(duplicate_name, conflictsWith)
```

Properties this contract must demonstrably have, each directly testable:

- One malformed package never aborts the scan (FR-025).
- A missing or unreadable root is an informational notice, not a failure
  (FR-028).
- No file outside a package root is ever read or exposed (FR-029).
- The result is deterministic for a given filesystem state (FR-014, SC-010).
- The registry is built lazily, cached at module scope, and invalidated only
  through `invalidateSkillRegistry()` — no mutable global, no import-time I/O
  (P10, FR-027).

---

## 4. Presentation to the model

**Catalogue** — injected at a new `{{SKILLS}}` placeholder in the tool system
prompt, mirroring the existing `{{TOOLS}}` mechanism, so enabling a skill never
requires a prompt edit:

```text
Available skills (load one with load_skill before following its procedure):
- wiki-linker: Convert keywords in a page that already have wiki pages into links. …
- wiki-tagger: Propose tags and metadata for pages. …
```

Only name and one-line description (FR-018). Disabled, invalid, and rejected
skills never appear.

**Tools** — registered in `ai-tool-registry.ts` alongside the existing built-ins:

```text
load_skill(name: string)
  -> { name, description, content }        # SKILL.md body, truncated per budget
     plus the file list so the model knows what else it may read

read_skill_file(name: string, path: string)
  -> { path, contentType, content }        # text only, truncated per budget
```

Both are `category: read`, `riskLevel: read`, `requiredScope: use_ai_qa`,
`resultRetention: never_full_result`, `defaultReviewPolicy: allow_immediate`.

`never_full_result` is deliberate: skill instructions are configuration, not
evidence, and must not be captured as Raw evidence when a turn produces durable
knowledge.

**Budget** — a per-turn cap on total loaded skill content. Exceeding it truncates
with an explicit marker in the returned content and records the truncation on the
tool-call row (FR-021), using the same truncation policy as every other tool
result (FR-006).

---

## 5. Script non-execution

`read_skill_file` returns a script's bytes as text and nothing else. There is no
code path from a skill file to `child_process`, `vm`, `eval`, or a dynamic
`import()`.

Verified by:
1. A structural test asserting no execution primitive appears anywhere in
   `server/services/skills/`.
2. Behavioural tests per source — built-in, directory, admin-authored — that a
   skill containing an obviously side-effecting script produces no side effect
   (SC-007).

---

## 6. Built-in packages

Shipped as real files under `apps/web/src/server/skills/builtin/` and enumerated
explicitly in `builtin.ts`.

### `wiki-writer`

Drafting new pages and expanding thin ones. Procedure: locate or confirm the
target page, gather context through the existing read tools, draft or expand,
then write through `create_page` / `save_draft` so the change lands as a draft or
proposed revision (FR-039). Never publishes.

### `wiki-tagger`

Propose tags and metadata for the pages named in the conversation. Procedure:
read current tags, propose additions and removals with a reason each, submit
through the existing tag/metadata tools so the result is a reviewable proposal
with before/after detail (FR-040).

### `wiki-linker`

Convert keywords that already have wiki pages into links (FR-041).

Constraints the skill text must state and the proposal must honour (FR-042,
FR-043, SC-009, spec edge case):

- Only link a keyword with an existing, unambiguous, user-readable target page.
- Leave keywords with no target page unchanged.
- Skip ambiguous matches — several candidate pages — rather than guessing.
- Never link inside an existing link, a code span or fenced block, a heading, or
  a URL.
- Link the first occurrence per page by default, not every occurrence.
- The proposal shows keyword, location in the page, and target page, and is
  accepted or rejected as one change.

Descriptions for all three are written for **trigger match quality**, not prose:
they name the task and the phrasings a user is likely to use, because under
model-driven selection the description is the only thing standing between a
request and the right skill (spec assumption, SC-012).
