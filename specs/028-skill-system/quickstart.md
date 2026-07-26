# Quickstart: Skill System & Provider-Agnostic Tool Calling

How to exercise this feature once it is implemented, and how to verify each
success criterion.

---

## 1. Run it

```bash
pnpm install && pnpm db:migrate && pnpm dev
```

Built-in skills need no configuration: Wiki Writer, Wiki Tagger, and Wiki Linker
ship inside the image and are enabled by default (FR-044).

Open **Admin → AI → Skills** (`/admin/ai/skills`).

---

## 2. Mount host skills

Add to `.env`:

```bash
SKILLS_HOST_PATH=./.skills
SKILLS_BASE_PATH=/data/skills
```

Create a package on the host:

```bash
mkdir -p .skills/release-notes
```

`.skills/release-notes/SKILL.md`:

```markdown
---
name: release-notes
description: Draft release notes from a changelog. Use when asked to write, summarise, or format release notes.
---

# Release Notes

## Procedure
1. Read the changelog page.
2. Group changes by type.
3. Draft the page and save it as a draft.
```

Then:

```bash
docker compose up -d --build
```

The compose file mounts the directory read-only. The skill appears in the Skills
section marked **read-only**, with no in-app configuration step (SC-003).

---

## 3. Verify each success criterion

### SC-001 / SC-002 — provider-agnostic tool calling

```bash
pnpm --filter @next-wiki/web test -- provider-conformance
pnpm --filter @next-wiki/web test -- ai-tool-planners
```

Manually: configure two chat models from different vendors, one with
`tool_call_strategy = native` and one with `text`. Ask each the same question
("find pages about X and add a tag to the most relevant one"). The chat timeline,
the tool calls, and the resulting proposal must be identical; only the provider
request bodies differ.

Then switch the configured model to another vendor and repeat the request with no
other change (SC-002).

### SC-004 — a bad package never breaks the scan

```bash
mkdir -p .skills/broken && echo "no frontmatter" > .skills/broken/SKILL.md
```

Rescan from the Skills section. `release-notes` still loads; `broken` appears
under rejections with `invalid_frontmatter` and a specific reason.

### SC-005 — catalogue overhead stays bounded

With 20 skills enabled, ask an ordinary question. Inspect the request in
**Admin → Request logs**: the system prompt must contain one short line per
skill and no skill body. Then ask a question that matches one skill and confirm a
single `load_skill` tool call appears in the timeline.

### SC-006 — edit and reset a built-in skill

Open Wiki Linker → `SKILL.md`, add a line to its procedure, save. Ask the
assistant to link a page and confirm the new instruction is followed. Then use
**Reset to default** and confirm the shipped content returns.

### SC-007 — scripts are never executed

```bash
pnpm --filter @next-wiki/web test -- skills
```

Includes the structural assertion that `server/services/skills/` contains no
execution primitive, plus behavioural tests for all three sources.

### SC-008 / SC-009 — the built-in skills

On a fresh install with a few pages:

1. "Expand the page at /guides/backup, it's too thin." → a draft with a diff.
2. "Tag the pages under /guides." → a tag proposal with before/after detail.
3. "Link the concepts in /guides/backup that we already have pages for." → a link
   proposal listing keyword, location, and target page.

None of the three may publish anything. For SC-009, confirm the proposal contains
no link to a non-existent page, no nested link, and nothing inside a code block.

### SC-010 — duplicate names

```bash
mkdir -p .skills/wiki-tagger && \
  printf -- '---\nname: wiki-tagger\ndescription: dupe\n---\n' > .skills/wiki-tagger/SKILL.md
```

Rescan. The built-in Wiki Tagger keeps working; the mounted one appears as a
`duplicate_name` rejection naming both locations. Rename the host directory *and*
its declared `name`, rescan, and confirm it loads with the conflict report
cleared — no restart.

### SC-011 — no privilege escalation

As a user who cannot edit `/private/notes`, ask the assistant to use Wiki Writer
on it. The skill loads; the write is refused by the permission check. Confirm the
refusal is recorded and no draft was created.

### SC-012 — trigger accuracy

Phrase each built-in skill's task three different ways and confirm it loads each
time without any special syntax. Then ask an ordinary question ("what is our
backup policy?") and confirm no skill is loaded.

### SC-013 — backup covers customisation

Edit a built-in skill, create an admin-authored skill, `pg_dump`, drop and
restore the database, and confirm both survive exactly. Confirm the service runs
with the skills mount attached `:ro`.

---

## 4. Test commands

```bash
pnpm --filter @next-wiki/web test
```

```bash
pnpm --filter @next-wiki/web test:e2e
```

Stop any preview or manual dev server before running the E2E suite — leftover
servers starve CPU and look like test regressions.

```bash
pnpm lint && pnpm typecheck
```

---

## 5. Full-stack verification

```bash
docker compose up -d --build
```

Confirm: the skills mount is read-only, an edit made in the admin UI does **not**
appear on the host copy (FR-026a), a rescan picks up a host change without a
restart, and the service starts normally with `SKILLS_HOST_PATH` pointing at a
path that does not exist (FR-028).
