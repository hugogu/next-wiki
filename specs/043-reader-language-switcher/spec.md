# Feature Specification: Reader Language Switcher

**Feature Branch**: `claude/reader-language-switcher`

**Created**: 2026-10-06

**Status**: Implemented

**Input**: "Language switching is at the end of the page actions menu. Add a
separate language-switch button to the toolbar, and remember the language that was
chosen: for pages that have a version in it, always show that version; for pages
that do not, fall back to the default."

**Builds on**: 015 (AI page translation), 042 (optional page language).

## Summary

A page with translations lets the reader move between the original and each
translation, but the control was the last section of the "···" actions menu, a
place nobody looks for it, and it forgot the choice: every page opened in the
original again. This feature gives it a button of its own in the toolbar and makes
the choice stick, so a reader who prefers English reads English wherever English
exists, and the original everywhere else.

## Decisions

1. **A globe button in the header toolbar, beside "···".** It appears only when
   the page has translations; its dropdown lists Original and each available
   language, with the one being read checked. A globe, not the 文A of "Translate
   this page", which is a different (admin-only) action.
2. **One entry point.** The language list is removed from the actions menu. The
   toolbar's hover dropdown shell is shared (`ToolbarMenu`) instead of copied.
3. **The choice is remembered in the reader's browser** (`localStorage`,
   `next-wiki-reading-language`). Choosing Original clears it, so "no choice yet"
   and "the original" mean the same: a page opens as written. Blocked or absent
   storage just means the choice is not remembered.
4. **It is applied to a page's original address only.** Opening the original of a
   page that has a version in the remembered language shows that version; a page
   without one stays as written. A link straight to a language (`/…/en/…`) is an
   explicit choice and is never redirected. The switch uses `router.replace`, so
   Back does not land on the page that just redirected, and it keeps the query
   string and anchor.
5. **It happens in the browser, after the page loads.** Public reader pages are
   cached static documents, and the constitution forbids varying them by cookie
   or session (anti-pattern: session-bound public documents). The price is a brief
   flash of the original on the first load of such a page.

## Requirements

- **FR-001** A page that has translations shows a language button in the toolbar;
  a page without translations shows none.
- **FR-002** Switching language is available in exactly one place on the page.
- **FR-003** The language a reader picks, including Original, is remembered in
  that browser.
- **FR-004** Opening the original address of a page that has a version in the
  remembered language shows that version; otherwise the original is shown.
- **FR-005** An address that already names a language is never redirected.
- **FR-006** The automatic switch does not trap Back and does not drop a query
  string or anchor.
- **FR-007** No account is needed, and the cached public document is the same for
  every reader.

## Out of Scope

- Saving the choice to a signed-in user's profile so it follows them across
  devices. It would be an additive setting; the browser-local choice stays the
  fallback for readers without an account.
- Avoiding the first-load flash. It would need either per-reader HTML (ruled out
  above) or an inline script that runs before hydration.
- Defaulting to the interface language when nothing has been chosen.
- The static site publisher, which has its own language chips.

## Verification

- `reading-language.test.ts`: remembering, forgetting, rejecting malformed values,
  surviving blocked storage.
- `ReaderLanguageSwitcher.test.tsx`: the button and its links, the checked
  version, remembering a pick, and each rule of the automatic switch (remembered
  language present, absent, none chosen, opened directly, no translations, no
  repeat on re-render, query string and anchor kept). Each rule was checked to fail
  when its code is reverted.
- `Header.test.tsx`: the button is in the toolbar, the old menu section is gone,
  and each version is linked exactly once.
- `e2e/reader-language-switcher.spec.ts`: the whole story as an anonymous reader.
