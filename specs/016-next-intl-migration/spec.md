# Feature Specification: Unified UI Localization

**Feature Branch**: `codex/016-next-intl-migration`
**Created**: 2026-07-13
**Status**: Complete
**Input**: User description: "按建议引入 next-intl，以替代现有本地化方案。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use one consistent interface language (Priority: P1)

As a reader or signed-in user, I want every interface element on the current
screen to use my selected language, so that I can navigate, read feedback, and
complete actions without encountering a mixed-language experience.

**Why this priority**: A consistent UI is the core value of localization and
must work before more advanced formatting or future language expansion can be
useful.

**Independent Test**: Select English and Chinese in turn, then visit public,
authentication, user, editor, and administrator screens and trigger ordinary
loading, validation, confirmation, and error states. Each screen displays its
available interface text in the selected language.

**Acceptance Scenarios**:

1. **Given** a visitor has not chosen a language, **When** they first open the
   site, **Then** the interface selects a supported language from their browser
   preference when possible, otherwise it uses the product default.
2. **Given** a user is viewing any supported screen, **When** they switch the
   interface language, **Then** visible interactive text changes to the chosen
   language and refreshed or subsequently navigated screens use that same
   language.
3. **Given** a supported localized message includes a name, count, date, time,
   or number, **When** it is shown, **Then** its wording and formatting follow
   the selected interface language.
4. **Given** a translation is temporarily missing for a non-critical label,
   **When** the label is displayed, **Then** the user sees the documented
   fallback language rather than an empty label, raw message identifier, or a
   failed screen.

---

### User Story 2 - Keep a language preference across visits and devices (Priority: P1)

As a signed-in user, I want my saved interface-language preference to be used
consistently whenever I return, so that I do not need to reset it on every
screen, browser session, or device.

**Why this priority**: The product already offers a saved language preference;
replacing its localization foundation must preserve that user-facing promise.

**Independent Test**: Save each supported language as a profile preference,
sign out and back in or use a second browser, and verify that authenticated
screens and the document language declaration use the saved choice.

**Acceptance Scenarios**:

1. **Given** an authenticated user has saved a supported language preference,
   **When** they open the site without a matching browser setting, **Then** the
   saved preference takes precedence and the interface is rendered in it.
2. **Given** a user changes their language preference, **When** they return in
   a later session, **Then** the chosen language remains selected.
3. **Given** a stored preference is unsupported or unavailable, **When** the
   user visits the site, **Then** the system safely falls back to the standard
   preference-resolution order and allows the user to choose a valid language.

---

### User Story 3 - Read localized content without URL ambiguity (Priority: P1)

As a public reader, I want interface localization to remain separate from
translated wiki content, so that a bookmark always opens the intended original
or translated document and language switching never changes the document being
read.

**Why this priority**: The product already publishes AI-generated content
translations at language-prefixed reader addresses. Reusing those addresses for
interface preference would make documents ambiguous and break shared links.

**Independent Test**: Open an original public page and an existing translated
page through their respective stable URLs, change the interface language, and
refresh or share both addresses. Each continues to resolve to the same content
version while interface controls use the selected language.

**Acceptance Scenarios**:

1. **Given** a published original page, **When** a reader changes the
   interface language, **Then** the original page's canonical address and
   document content do not change solely because of that preference.
2. **Given** a published content translation, **When** a reader opens its
   established language-prefixed address, **Then** it continues to resolve to
   that translation regardless of the reader's interface language.
3. **Given** public pages are served from reusable published representations,
   **When** interface localization is introduced, **Then** anonymous document
   bodies and public document metadata remain independent of cookies, request
   headers, sessions, and individual language preferences.

---

### User Story 4 - Safely expand and maintain interface languages (Priority: P2)

As a product maintainer, I want localized UI messages to be organized,
validated, and extensible, so that adding or changing a supported interface
language does not silently leave users with broken, stale, or inconsistent
screens.

**Why this priority**: The immediate migration covers the existing languages,
but maintainability determines whether the new foundation remains valuable.

**Independent Test**: Review the release validation for both current languages,
change representative messages from several product areas, and verify that an
incomplete or invalid localized message is detected before release.

**Acceptance Scenarios**:

1. **Given** a maintainer changes a user-facing message, **When** release
   validation runs, **Then** it identifies missing required translations,
   unsupported placeholders, and invalid language-specific message forms.
2. **Given** the product adds a future interface language, **When** its message
   set and language metadata are supplied, **Then** it can participate in the
   same selection, fallback, formatting, and validation behavior without
   changing the meaning of existing content-translation URLs.

### Edge Cases

- A browser advertises several languages, the first is unsupported, and a
  later supported language has a lower preference weight.
- The server-rendered screen, interactive shell, metadata, and document
  language declaration initially receive different language signals.
- A user changes language while an action is pending, then receives validation
  or error feedback after the change.
- A saved preference refers to a retired interface language, or an older
  browser has an obsolete preference value.
- A content-translation language code matches an interface-language code;
  reader URLs must still identify content translations rather than interface
  variants.
- A public page is generated or refreshed while users with different interface
  preferences visit it; no preference-specific content may enter the shared
  public representation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace the current custom UI-localization
  runtime with the selected mature localization solution while preserving all
  currently supported English and Chinese user-facing UI coverage.
- **FR-002**: The system MUST use one documented interface-language resolution
  order: a valid authenticated user's saved preference, then a valid browser
  preference stored by the product, then the browser's declared preferences,
  then the product default.
- **FR-003**: The system MUST apply the resolved interface language
  consistently to server-rendered UI, interactive UI, page metadata that is
  interface text, and the document language declaration.
- **FR-004**: Users MUST be able to change between every currently supported
  interface language from the existing language-preference surfaces. The
  change MUST persist for authenticated users and apply to subsequent screens.
- **FR-005**: The system MUST support localized variable interpolation,
  singular and plural wording, conditional wording, rich text where a message
  requires it, and language-aware date, time, number, and relative-time
  formatting.
- **FR-006**: The system MUST provide a defined fallback for an unavailable UI
  message that preserves a usable screen and makes missing localization
  detectable during release validation.
- **FR-007**: The system MUST validate the completeness and compatibility of
  all required interface messages before a release; validation MUST detect a
  missing message and incompatible message variables or forms.
- **FR-008**: The system MUST avoid delivering unused full-language interface
  message sets to an interactive screen when only one selected language and its
  required messages are needed.
- **FR-009**: The system MUST preserve all existing public, authentication,
  administration, user, editor, API, and content-reader URLs. An
  interface-language change MUST NOT create a new competing locale-prefixed
  version of those URLs.
- **FR-010**: The system MUST keep interface languages distinct from the
  administrator-managed languages used for AI-generated page translations.
  A content translation's language code, lifecycle, availability, and reader
  URL MUST remain governed by the content-translation feature, not by UI
  preference selection.
- **FR-011**: The system MUST preserve the existing canonical source-page URL
  and established language-prefixed content-translation URLs. Switching the
  interface language MUST NOT redirect a reader between original and
  translated page content.
- **FR-012**: The system MUST preserve the public-content delivery contract:
  an anonymously readable published page's body, public metadata, and public
  navigation representation MUST remain reusable and must not vary by session,
  cookie, request header, or interface-language preference. Personalized UI
  controls may be localized outside that shared document representation.
- **FR-013**: The system MUST preserve existing saved interface preferences and
  provide a safe fallback for invalid legacy values; no user action may be
  required solely because the localization foundation has changed.
- **FR-014**: The system MUST make every user-facing accessibility label,
  status, and error exposed by the migrated screens available in the resolved
  interface language.

### Public Content Delivery

- Published document bodies and content-derived metadata do not change scope in
  this feature. Their canonical original and content-translation URLs remain
  unchanged and continue to use the existing reusable public representations.
- Interface-localized controls around public documents are personal UI and
  cannot make the shared document body, public metadata, or public navigation
  cache vary by browser preference, cookie, or signed-in user.
- No user-initiated localization mutation invalidates a published document
  representation. Existing content publish, unpublish, path, metadata,
  translation-state, and language-availability mutations retain their current
  invalidation responsibilities.

### Key Entities

- **Interface language**: A product-supported language used to present labels,
  feedback, metadata, and accessibility text. It is selected by the user or
  resolved from browser settings and is independent of a document's language.
- **Interface message**: A maintained localized unit of UI text, including its
  variables and language-specific forms, used across server-rendered and
  interactive product surfaces.
- **Language preference**: A user's saved choice of interface language, with a
  browser-stored counterpart for visitors who are not signed in.
- **Content translation language**: An administrator-managed target language
  for AI-generated wiki-page translations. It owns reader URL behavior and is
  not interchangeable with an interface language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user-facing UI messages currently available in English
  and Chinese, including validation, loading, confirmation, error, and
  accessibility text, are available in both languages after migration.
- **SC-002**: In end-to-end checks across public, authentication, user,
  editor, and administrator surfaces, 100% of tested language changes result
  in a single consistent interface language after the current page is refreshed
  or a new screen is opened.
- **SC-003**: In 100% of tested returning-user scenarios, a valid saved
  language preference overrides conflicting browser preferences and is applied
  on the first authenticated screen.
- **SC-004**: In 100% of tested original and content-translation bookmarks,
  changing interface language preserves the requested canonical document URL
  and content identity.
- **SC-005**: Release validation rejects 100% of fixtures containing a missing
  required message or incompatible message variable/form before they can be
  shipped.
- **SC-006**: Public-page regression checks confirm that anonymous document
  body and public metadata are identical for equivalent requests that differ
  only by interface-language preference.

## Assumptions

- The first release retains the existing English and Chinese interface
  languages; adding another UI language is enabled by the new foundation but is
  not part of this migration.
- The user's existing saved profile preference and visitor browser preference
  remain the product's preferred persistence mechanisms.
- AI-generated page translation, its language administration, and its existing
  language-prefixed reader URLs are already delivered behavior and are outside
  this feature except for compatibility protection.
- The selected localization solution is next-intl, as requested; detailed
  integration choices, message organization, and migration sequencing belong
  in implementation planning rather than this specification.
- This feature does not localize user-authored wiki content, change supported
  content languages, introduce locale-prefixed UI routes, or alter public API
  response schemas.
