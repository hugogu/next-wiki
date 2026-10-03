# Feature Specification: Optional Page Language

**Feature Branch**: `claude/page-language-setting`

**Created**: 2026-10-03

**Status**: Implemented

**Input**: "When I try to translate it, it shows 'EN is unavailable because this
page is recorded in that language.' I believe the current status recorded as EN
page is wrong. Build a feature to correct it, allow user set its locale/lang by
themselves. A page may not have its lang settings by default, don't enforce
them to have a lang with it."

**Builds on**: 015 (AI page translation), 035 (page slug routing), 031 (static
site publishing). The translation dialog change that surfaced this is
hugogu/next-wiki#151.

## Summary

Every page was recorded as English (`pages.locale` defaulted to `en`), because
nothing let anyone say otherwise. The translation feature then trusted that
value: it refuses to translate a page into "its own" language, so a Chinese page
could not be translated into English. This feature makes the language what it
should always have been — **something a person says about a page, and optional**.
A page has no language until someone sets one; whoever can edit the page can set,
change or clear it; and translation only refuses a target language when the page
has been told it is written in that language.

## Decisions

1. **`pages.locale` is the language the page's text is written in, and it is
   nullable with no default.** `NULL` means nobody has said. Nothing assigns one
   automatically, and nothing requires one.
2. **Only a translation row is addressed by its locale.** A translation lives at
   `/{locale}/{slug}`; an original is served at its bare address whatever
   language it is in. Setting an original's language therefore never changes a
   URL. (`routingLocale(page)` encodes this.)
3. **The tree identity key stays `(space_id, path, locale)`**, now
   `UNIQUE NULLS NOT DISTINCT`, so "no language" counts as a value of its own and
   two originals still cannot share a path. A `CHECK` guarantees a translation
   row always has a language.
4. **The migration clears the `en` placeholder on originals only.** Every
   existing original carries `en` because it was the default, not a choice.
   Translations keep their language (it is the language they are written in), and
   an original with any other value (for example from a Wiki.js import) keeps it.
   An original that really is English now shows "Not set", and can be set to
   English again in one click. *This is the one decision a reviewer may want to
   veto: the alternative is to keep `en` everywhere and leave every page wrong
   until someone corrects it.*
5. **Setting the language is page metadata, like the title.** It needs edit
   permission, creates no revision, leaves path and address alone, and tells the
   public cache, the Git export and the static site (which all carry it).
6. **A change is refused with `409 PAGE_LANGUAGE_CONFLICT`** when the page
   already has a translation in that language, or another page already holds its
   path in that language. A translation's own language cannot be set.
7. **Translation refuses a target only when it equals the page's declared
   language.** A page with no language can be translated into any language,
   English included.

## User Scenarios

### US1 — Set the language of a page (P1)

*As an editor I can say which language a page is written in, change it, or
clear it, so the wiki stops claiming something false.*

- Page properties (reader dialog and editor panel) has a **Language** select:
  "Not set" plus the supported languages.
- `PATCH /api/v1/pages/{id}` accepts `locale` (two-letter ISO 639-1 code; `null`
  clears; omitted leaves it). MCP `update_page_properties` takes the same field.
- Saving a language never publishes anything and never moves the page.

### US2 — Translate a page whose language was recorded wrongly (P1)

*As an admin, when the translation dialog says a page is in the language I want
to translate into, I can fix that without leaving the task.*

- The "{language} is unavailable" hint carries **Change this page's language**,
  which opens Page properties for anyone who may edit the page.
- A page with no language shows no hint and offers every language.

### US3 — Leave the language unset (P1)

*As an author I never have to pick a language.* Creating, importing, exporting
and publishing a page all work with no language. Archives and Wiki.js exports
require a language on every page, so an unset one is written as `und` (BCP 47
"undetermined") and read back as unset.

## Requirements

- **FR-001** A page's language is optional and has no default.
- **FR-002** Whoever may edit an original page can set, change or clear its
  language; the change is recorded as page metadata, not a revision.
- **FR-003** Setting a language the page already has a translation in, or that
  another page holds at the same path, is refused with `PAGE_LANGUAGE_CONFLICT`.
- **FR-004** A translation's language cannot be changed.
- **FR-005** Translating a page into its declared language is refused;
  translating a page with no language into any language is allowed.
- **FR-006** "Every page is already in that language" is reported only when every
  page the request names is a published source page in the target language;
  otherwise the generic "no eligible pages" error is.
- **FR-007** No consumer may assume an original is English: URL builders, the
  static site, the Git export, archives and imports treat an unset language as
  unset.
- **FR-008** Public page resources, citations and migration items report
  `locale: string | null`.

## Out of Scope

- The `locale` accepted by `POST /api/v1/pages` (and MCP `create_page`) is
  validated but still **ignored**, as before. Honouring it is a separate change.
- Telling Wiki AI a page's language, and emitting `<html lang>` on reader pages.
  The static site does emit `<html lang>` when it is known.
- `page_revisions.locale` is written by some code paths and read by none. It is
  now nullable and otherwise untouched.
- The `update_page_properties` tool description is shared with the in-app AI
  tool, which does not set a page's language, so it is unchanged.

## Verification

- Schema: `page-locale-schema.test.ts` pins the nullable column, the NULL-aware
  identity key, the translation `CHECK`, and the migration's data statement
  (which is read from the `.sql` file, so the test cannot drift from it).
- Service and API: `page-language.test.ts` and the PATCH route test cover
  permission, no revision, change notification, conflicts (including a
  translation whose path drifted and a sibling original at the same path),
  normalization and validation, and that a translation id cannot be used to
  change an original's language.
- Translation: `translations.test.ts` has a case per review finding, and each was
  checked to fail against a plain `<>` / a non-exact coverage count.
- UI: component tests for the field, the dialog's save order and conflict
  handling, and the translate dialog; `e2e/page-language.spec.ts` sets, changes
  and clears a language and corrects a wrongly recorded one from the translation
  dialog.
