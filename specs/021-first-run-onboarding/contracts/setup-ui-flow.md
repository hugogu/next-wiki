# UI Contract: First-Run Onboarding

**Feature**: 021-first-run-onboarding
**Canonical URL**: `/setup`

The setup UI is a first-run application surface, not a marketing landing page.
It uses the existing application layout, design tokens, form controls, alerts,
and i18n dictionaries.

## Route Behavior

### `/setup`

States:

- `account`: anonymous first Admin account form.
- `ai`: signed-in Admin optional OpenRouter bootstrap.
- `sample_pages`: signed-in Admin optional example/help page generation.
- `summary`: signed-in Admin final status and links.
- `closed`: setup unavailable; page redirects to `/` or shows not-found style
  behavior according to the existing route pattern.

Rules:

- `/setup` is the only first-run setup entry point.
- Refreshing the route reads server setup state and resumes the next incomplete
  step.
- Browser back/forward must not duplicate side effects; submitted steps are
  server-idempotent.
- Step controls are not embedded in published wiki pages.

## Step 1: Admin Account

Required controls:

- Email input.
- Password input.
- Submit button.
- Inline validation errors.
- Server error alert for already-configured, duplicate email, or invalid input.

Success:

- Creates Admin.
- Signs in the new Admin.
- Moves to `ai`.

## Step 2: OpenRouter Bootstrap

Required controls:

- Skip AI setup action.
- OpenRouter API key password/secret input.
- Start/continue setup action.
- Retry action after recoverable failure.
- Clear statement that AI setup is optional and can be completed later from
  Admin AI settings.

Status display:

- `not_started`: form and skip action.
- `queued`/`running`: progress state with no duplicate submit.
- `completed`: per-purpose configured summary.
- `partial`: configured purposes plus manual setup links.
- `failed`: safe error with retry/edit/skip options.
- `disabled`: AI unavailable by policy with skip/continue option.

Per-purpose labels:

- Chat / Wiki answers: `wiki_text`.
- Embeddings / semantic retrieval: `wiki_embedding`.
- Image generation: `wiki_image`.

## Step 3: Sample and Help Pages

Required controls:

- Generate examples action.
- Skip examples action.

Generated page summary:

- `welcome`: created, updated, skipped, collision, or failed.
- `help/markdown-syntax`: created, skipped, collision, or failed.
- `help/main-features`: created, skipped, collision, or failed.

Rules:

- Collisions are shown clearly and never overwrite user-authored pages
  silently.
- Generated page links use normal wiki URLs.
- Declining examples does not create optional help pages.

## Step 4: Summary

Required summary sections:

- Admin account status.
- AI status: skipped, configured, partial, failed, or disabled.
- Per-purpose AI setup result.
- Sample page result.
- Remaining manual actions.

Required navigation:

- Link to wiki home `/`.
- Link to Admin AI settings when AI setup is partial, failed, skipped, or
  disabled.
- Links to generated sample pages when available.

Rules:

- Summary contains no credentials.
- Setup completion closes anonymous account setup.
