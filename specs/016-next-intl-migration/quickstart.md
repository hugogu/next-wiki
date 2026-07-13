# Quickstart: Validate Unified UI Localization

## Prerequisites

- Node.js 20.9+ and pnpm 10.
- Workspace dependencies installed with `pnpm install`.
- For database-backed and end-to-end checks, the documented local test database
  and application environment from `apps/web/.env.example`.

## 1. Static checks and focused tests

Run from the repository root:

```bash
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web build
```

Expected outcomes:

- Type checks reject an unknown UI message key, unsupported UI locale, or
  incompatible message value/form.
- Unit tests cover language resolution precedence, weighted browser-language
  fallback, invalid cookie/preference recovery, ICU formatting, and error-code
  mapping.
- Component tests use the new localization provider/helper rather than the
  retired custom provider.
- The production build preserves the public reader's static/ISR eligibility.

## 2. Dynamic interface language and preference checks

Start the web application using the project's normal development command, then
run the relevant Playwright suite:

```bash
pnpm --filter @next-wiki/web test:e2e
```

Validate in both `en` and `zh`:

1. Open authentication, user center, editor, administration, search, and page
   screens; verify ordinary labels, validation, loading, confirmation, errors,
   and accessibility names are in the selected UI language.
2. Change language through the header and profile preference surfaces. Verify
   the active route refreshes and server UI, interactive UI, `<html lang>`, and
   dynamic-route metadata agree.
3. Sign in with a conflicting browser cookie and saved account preference.
   Verify the saved preference wins; repeat on a fresh browser to verify
   cross-device persistence.
4. Set an invalid/obsolete cookie or legacy stored value in a test fixture.
   Verify safe fallback and a usable language selector.
5. Confirm a failed preference save reports localized feedback and does not
   falsely claim persistence.

## 3. Message catalog and formatting checks

1. Run catalog validation with deliberate fixtures for a missing key,
   incompatible ICU variable/form, plural message, rich message, date, number,
   and relative time.
2. Verify each invalid fixture fails before release.
3. Verify representative timestamps and numeric values from admin, user-center,
   transfer, AI, and public-reader UI use the selected UI locale rather than an
   unscoped browser default.

## 4. Public reader, URL, and cache checks

1. Publish an original page and create an enabled Chinese content translation.
2. Visit `/guide` and `/zh/guide` with conflicting `next-wiki-locale` cookies
   and `Accept-Language` headers.
3. Verify `/guide` always contains the original document, `/zh/guide` always
   contains the Chinese content translation, and neither address changes after
   switching UI language.
4. Compare anonymous public document body, canonical URL, hreflang output, and
   content-derived metadata for otherwise equivalent requests that differ only
   by UI preference. They must be identical.
5. Change a UI preference and verify no public route/tag invalidation occurs.
   Then publish, unpublish, or refresh content translation and verify the
   existing public-content invalidation behavior still applies.

## References

- [Data model](./data-model.md)
- [UI localization contract](./contracts/ui-localization.md)
- [Research decisions](./research.md)
