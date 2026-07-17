# Quickstart: First-Run Onboarding

**Feature**: 021-first-run-onboarding
**Purpose**: Validate first-run Admin setup, optional OpenRouter AI bootstrap,
optional sample/help pages, recovery, and public content behavior.

## Prerequisites

- Dependencies installed with `pnpm install`.
- PostgreSQL configured through the normal project environment.
- Database migrations applied with `pnpm db:migrate`.
- Use a clean test database for first-run scenarios.
- Optional: a valid OpenRouter API key for manual end-to-end AI bootstrap
  verification. Automated tests should use mocked detector/provider fixtures.

## Run Core Checks

```bash
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test:e2e -- setup-onboarding.spec.ts
```

Expected result:

- Unit, route, service, and E2E tests pass.
- No lint warnings.
- Typecheck passes.

## Scenario 1: First Admin Account

1. Start with no users in the database.
2. Open `/setup`.
3. Submit a valid email and password.
4. Refresh `/setup`.
5. Attempt to submit the setup account form from a second browser that opened
   before step 3.

Expected result:

- The first submit creates exactly one Admin account and signs the operator in.
- Refresh resumes the AI setup step.
- The second browser cannot create another Admin.
- Direct setup-account access after Admin creation is closed.

## Scenario 2: Skip AI Setup

1. Complete Admin account setup.
2. On the OpenRouter step, choose skip.
3. Continue to sample-page choice.
4. Open normal wiki read and admin pages.

Expected result:

- No outbound AI, detector, embedding, chat, or image-generation call is made.
- Non-AI wiki read, author, and admin workflows remain usable.
- Summary identifies AI as skipped and links to Admin AI settings.

## Scenario 3: OpenRouter Bootstrap

1. Complete Admin account setup.
2. Enter a valid OpenRouter key.
3. Start AI bootstrap.
4. Poll or refresh until setup state is terminal.

Expected result:

- Credentials are not visible after save.
- OpenRouter detector/model sync runs through existing AI action status when
  needed.
- Compatible models are assigned to `wiki_text`, `wiki_embedding`, and
  `wiki_image` where detected.
- Missing or ambiguous capabilities are marked as manual setup, not guessed.
- The initial Admin can use configured AI features subject to normal
  permissions.

## Scenario 4: OpenRouter Failure and Retry

1. Enter an invalid OpenRouter key.
2. Observe the error.
3. Replace it with a valid key or skip.
4. Refresh during retry.

Expected result:

- Error messages are safe and actionable.
- No plaintext key appears in logs, UI, persisted diagnostics, or API
  responses.
- The Admin account remains created.
- Retry does not duplicate providers or assignments.

## Scenario 5: Generate Sample and Help Pages

1. Choose generate examples.
2. Open wiki navigation as the Admin.
3. Open the same page links anonymously if anonymous reading is enabled.
4. Run generation again through retry/test hooks.

Expected result:

- `welcome` exists and links to the help pages.
- `help/markdown-syntax` renders headings, emphasis, lists, links, images,
  tables, code blocks, math, diagrams, and internal wiki links.
- `help/main-features` describes page authoring, revision history, publishing,
  navigation, search, AI chat, embeddings, image generation, imports/exports,
  and administration.
- Pages are normal published wiki pages with revision history.
- Re-running generation does not create duplicates.
- Public navigation and page reads reflect generated pages immediately after
  cache invalidation.

## Scenario 6: Decline Sample Pages

1. Choose skip examples.
2. Complete onboarding.
3. Inspect page list/navigation.

Expected result:

- Optional Markdown syntax and main features pages are not created.
- Summary identifies examples as skipped.
- The wiki remains writable and normal page creation works.

## Scenario 7: Path Collision

1. Before sample generation, create a user-authored page at
   `help/markdown-syntax`.
2. Run sample generation.

Expected result:

- User-authored content is not overwritten silently.
- Summary reports collision or required manual review.
- Non-conflicting sample pages are created or updated idempotently.

## Contract References

- REST behavior: [contracts/rest-api.md](./contracts/rest-api.md)
- UI flow: [contracts/setup-ui-flow.md](./contracts/setup-ui-flow.md)
- Data model: [data-model.md](./data-model.md)
