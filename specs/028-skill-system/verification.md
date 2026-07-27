# Verification Record: 028 Skill System & Provider-Agnostic Tool Calling

Walk of the success criteria in [quickstart.md](./quickstart.md) §3.
Recorded 2026-07-27 against commit `0a9b78f` plus the follow-up commits below.

**Environment note**: the workstation already had `next-wiki-db` and
`next-wiki-web` running from another checkout. Those were left alone, so the
container step was verified by building the image and exercising the mount
directly rather than by bringing up the full Compose stack. What that does and
does not prove is stated under SC-003 and SC-013.

| SC | Result | Evidence |
|---|---|---|
| **SC-001** — same task on a native-tool model and a text-protocol model | **PASS** | `ai-tool-planners.test.ts` drives one scripted scenario through both planners and asserts the resulting `ToolPlanStep` is deep-equal, plus identical usage reporting. The conformance table (`provider-conformance.test.ts`, TC-01…TC-09 × 2 adapters) pins the wire behaviour underneath. |
| **SC-002** — vendor switch needs zero configuration change | **PASS** | `ai-tool-strategy.test.ts` covers every row of the resolution table and asserts resolution always yields a usable strategy. The planners consume `listToolDefinitions()` directly, so the catalogue cannot diverge by vendor (asserted in `ai-tool-planners.test.ts`). |
| **SC-003** — host-installed skills visible on first start, no in-app step | **PASS (mount semantics)** / **PARTIAL (full stack)** | Verified in the browser against the dev server: a package placed in the mounted directory appeared as `source=directory`, read-only, enabled, with no configuration step. In the container: `docker compose config` resolves the bind with `read_only: true`, and a one-off run of the built image with the same mount read the package and had its write attempt rejected. The full `docker compose up` was not run — see the environment note. |
| **SC-004** — an invalid package never blocks startup or other skills | **PASS** | `directory-loader.test.ts` (malformed package alongside a valid one; missing, unreadable, and unconfigured roots all yield a notice rather than a failure). Confirmed in the browser: a `broken/` package appeared under *Not loaded* with `invalid_frontmatter` while the valid packages kept working. |
| **SC-005** — 20 skills cost names and descriptions, not documents | **PASS** | `wiki-question-tool-planner.test.ts` asserts 19 additional skills grow the system prompt by less than 19 × 80 characters, and that only the catalogue line — never a skill body — is injected. |
| **SC-006** — edit a built-in, see it take effect, restore the default | **PASS** | Verified end to end in the browser: edited `wiki-linker/SKILL.md`, the override was created on first write (`revision: 1`, `overridden: true`), the change was served on the next read, and *Reset to default* restored the shipped content with the revision history retained. Also covered by `admin-ai-skills.spec.ts`. |
| **SC-007** — no skill script is ever executed | **PASS** | `no-execution.test.ts` asserts structurally that no execution primitive (`child_process`, `vm`, `eval`, dynamic `import`) appears anywhere under `server/services/skills/`, and behaviourally that a side-effecting script in a directory-sourced skill leaves no trace. `governance.test.ts` adds that both skill tools are read-risk with `never_full_result` retention. |
| **SC-008** — expand, tag, and link each produce a reviewable proposal | **PARTIAL** | The governing properties are tested: `governance.test.ts` asserts each built-in routes through the draft or proposal path, names only tools that exist, and never instructs a publish. A live model turn producing an actual draft was **not** exercised — that needs a configured provider, so it is asserted at the instruction and tool-contract level rather than end to end. |
| **SC-009** — Linker links only unambiguous, readable, existing targets | **PARTIAL** | Each constraint a reviewer depends on is asserted to be stated in the skill (`builtin.test.ts`, ten individual rules plus the required answer format). The linking itself is performed by the model editing Markdown, so there is no server-side implementation to test against a page corpus. A wrong link is visible in the draft diff and resolves as dangling through the existing link resolution, so it fails safe. |
| **SC-010** — no two usable skills share a name | **PASS** | `registry.test.ts` (registration order, first-claim-wins) and `directory-loader.test.ts`. Verified in the browser: a mounted `wiki-writer` collided with the built-in, was reported with both locations, and the incumbent kept working; renaming on the host and rescanning cleared the conflict with no restart. |
| **SC-011** — no skill causes a change its user could not make; attribution | **PASS** | `attribution.test.ts` derives loaded skills from the `ai_tool_calls` chain and excludes loads that did not succeed. `governance.test.ts` pins that skill loading is read-risk only. Permission enforcement is the existing `PermCtx` path, unchanged by this feature. |
| **SC-012** — each built-in triggers on its task, not on ordinary questions | **PARTIAL** | The catalogue mechanics are tested (`wiki-question-tool-planner.test.ts`) and each description is asserted to name the task and the phrasings users use (`builtin.test.ts`). Measuring real trigger accuracy needs a live model and is not automated. |
| **SC-013** — a backup restores every customisation; `:ro` mount runs | **PASS (mount)** / **PARTIAL (backup)** | All editable-skill content lives in PostgreSQL (`skills`, `skill_files`, `skill_file_revisions`, `skill_settings`), so an ordinary dump covers it by construction; there is no second stateful location. The read-only mount was confirmed to run correctly. A dump/restore cycle was not performed. |

## Suites

- `pnpm lint` — clean across the workspace.
- `pnpm typecheck` — clean across the workspace.
- Unit/integration: **3412 passed**, 1 skipped, 1 failed. The failure
  (`storage-replication.test.ts`) passes in isolation and is unrelated to this
  feature; the failing file differs between full runs, which is the signature of
  the repository's known cross-file `TRUNCATE … CASCADE` state pollution rather
  than a regression.
- E2E: **98 passed**, 3 skipped, including the six new
  `admin-ai-skills.spec.ts` cases.

## Known gaps

- **T060 is closed, not outstanding.** FR-043 is satisfied by the draft diff:
  it shows each link's keyword (the link text), its location (the hunk), and its
  target (the href), and is accepted or rejected as one unit. Wiki Linker's
  entire output is edited Markdown, because a wiki derives its link graph from
  the source at read time (`findMarkdownLinks` in `public-content.ts`) rather
  than storing it. There is therefore no link record to render, and no schema
  change is warranted — a `link` proposal kind would bind the skill to
  next-wiki's storage and stop it working in any other tool.
- **T097** — no E2E for a skill-driven turn producing a proposal. It needs a
  configured provider in the E2E environment.
- The three PARTIAL rows above all share one cause: they describe model
  behaviour, and asserting it needs a live provider.
