# UI Contract: Outbound Request Logging

## Navigation and route ownership

Canonical Admin list route: `/admin/request-log`.

Canonical Admin detail route: `/admin/request-log/{id}`.

Navigation: add exactly one `REQUEST LOG` item to the existing `Data &
Operations` group in `Navigator.tsx`, alongside Access Log, Storage, Transfers,
and Analytics. Do not add a second request-log viewer under AI provider pages or
individual integrations.

List filters and pagination must be encoded in the list URL so refresh,
deep-link, browser back/forward, and copied diagnostic links restore the same
result set. The detail page has a visible back link to the current list URL.

## Settings panel

The list page begins with a compact settings panel containing:

- capture switch, default off;
- level selector: `Status`, `Header`, `All`;
- retention selector/input in hours, default 24 and allowed range 1–168;
- current last-updated time and Admin attribution;
- warning that `Header`/`All` may contain credentials and user content.

When the Admin selects `All` while enabling or changing to it, show the existing
project confirmation primitive with an explicit sensitive-data warning. The
PATCH request must include `confirmSensitiveCapture: true`; cancelling leaves
the previous setting unchanged. Turning capture off is a normal reversible
setting change and does not delete existing logs.

## List view

The list is newest-first and paginated. The first viewport prioritizes reading
space and shows:

- timestamp;
- source type and provider/integration;
- operation and method/target path;
- outcome and HTTP status when available;
- duration;
- attempt/correlation identifier;
- capture level.

Filter controls:

- time range;
- source type;
- provider/integration;
- operation;
- outcome;
- status code;
- correlation identifier.

Filters apply through URL state, with page reset to 1 when a filter changes.
Empty states distinguish “no captured records” from “no records match these
filters” and show the current switch/level.

Raw headers, bodies, target query details, and complete error envelopes are not
shown in list rows, tooltips, browser notifications, or URL parameters.

## Detail view

The detail page shows a summary header first:

- request source/provider/operation;
- method, safe target metadata, attempt, correlation/provider request IDs;
- start/completion time and duration;
- outcome, status, normalized error code/message;
- immutable capture level and expiry time.

Then render level-dependent sections:

1. Request headers (for `Header`/`All`) as all name/value pairs.
2. Response headers (for `Header`/`All`) as all name/value pairs.
3. Request body (for `All`) with content type/encoding/size and complete data.
4. Response body (for `All`) with content type/encoding/size and complete data.
5. Complete error details (for `All`) with structured fields and a safe raw
   representation where available.

Each raw section is collapsed by default and labeled as sensitive. The detail
view distinguishes unavailable, present-but-empty, malformed, binary, and
compressed content. Large content uses the existing scrollable/preformatted UI
primitive and does not push the page action bar into the document body.

## Permission and failure states

- Non-Admins and API-key actors receive the normal not-found/forbidden behavior
  and no record existence or metadata.
- If an Admin loses permission after opening the page, the next settings/list/
  detail request is denied; the UI clears sensitive data instead of retaining it
  in client state.
- If a capture write fails, the Admin list may omit that attempt; the original
  AI operation still reports its own provider result and the application logs a
  bounded internal diagnostic without request payloads.
- If a response has no status (pre-response failure), show `—` for status and
  the concrete timeout/cancel/transport outcome.
- If a response has a status but no body, show status and “empty body”; if no
  response exists, show “response unavailable”.

## Localization and accessibility

Add English and Simplified Chinese keys for navigation, settings, level names,
warnings, filters, columns, outcomes, sensitive sections, empty states, and
permission/error messages. Register keys in `src/i18n/keys.ts` and run the
existing i18n validation.

The switch, level selector, retention input, filters, raw disclosure sections,
back link, and pagination controls must have accessible labels and keyboard
behavior. Do not use browser alert popups; use the existing confirmation/modal
primitive for `All`.
