# UI Contract

## Chat research mode

The AI chat pane presents one compact mode control, restored from the existing
chat URL/session state:

| Mode | Label | Availability |
|---|---|---|
| wiki_only | Wiki only | Always available to an otherwise eligible AI chat user. |
| wiki_first_web | Wiki first + web | Enabled only when the signed-in user has web-research entitlement and the deployment service is active. |

The selected mode is stored as a URL-restorable query/session value alongside
the conversation. Refresh, back navigation, reopening the side pane, and
returning to an existing conversation restore the displayed mode. A shared URL
does not grant the recipient web entitlement; its client independently resolves
availability.

Selecting wiki_first_web for the first time in a conversation opens the existing
design-system dialog/popover flow before submission. It names the configured
service and states that the minimum search query may be processed outside the
Wiki. Confirm sets externalResearchConsent for that request; dismiss keeps the
mode at wiki_only and sends no action. Later turns may show a concise persistent
indicator rather than repeating the dialog.

Unavailable or ineligible controls are disabled with a non-sensitive
explanation. The pane must not reveal whether another user is entitled, whether
a secret is configured, or detailed source policy.

## Answer sources

ChatCitations renders two groups, not a visually merged list:

1. **Wiki sources**: Existing revision/page links and labels.
2. **External sources**: A clear External label, title, source type/provider,
   retrieval date/time, and original external URL.

External links use the application-standard external-link safety behavior and
never route through an internal page reader path. A score, snippet, provider
answer, or candidate not opened by the action is not displayed as supporting
evidence. If a source became unavailable after answering, metadata remains
clearly marked as a past retrieval rather than being presented as live content.

When a response is limited by source/time/budget/rate limit/policy, the answer
area shows the normal recoverable status and preserves any valid Wiki-only
answer. It must not retry externally without a new eligible user action.

## Preserve selected evidence

Each capture-eligible external citation has one Preserve as evidence control.
It appears in the source actions area rather than consuming reading-body space.

| State | Behavior |
|---|---|
| Eligible opened source | User can initiate capture; the UI immediately shows queued action status. |
| Capture queued/running | Disable duplicate interaction and show progress via existing action events. |
| Capture succeeded | Replace the control with a link to the Raw original source/revision. |
| Already captured | Render the durable evidence link; no duplicate source is created. |
| Expired/failed/policy/permission denied | Disable capture and show a concise reason; create no placeholder evidence. |

The control appears only for users who meet the existing evidence-create
permission. It does not present any edit, draft, publish, or automatic
knowledge-ingestion action. Navigating to evidence follows existing authenticated
Raw reader permission checks.

## Administration

The existing Admin AI area gains one Web Research panel/tab, not a duplicate
entry elsewhere. It contains:

- global enabled switch and configured provider selection;
- write-only credential entry and configured-state indicator;
- include/exclude domain lists and bounded per-turn limits;
- connection-test action and asynchronous last safe result;
- link to the per-user AI entitlement editor for webResearchEnabled;
- copy explaining outgoing query privacy, pricing/usage limits, and disabled
  fallback behavior.

Save and test use normal asynchronous/action feedback without browser alert
popups. Admin changes remain clearly distinct from model-provider settings and
from inactive external MCP configuration.

## Accessibility and localization

Mode selection, disclosure, source grouping, external-link label, capture
state, and admin errors must have localized keys. Controls have descriptive
accessible labels and keyboard operation. Status changes use existing polite
live-region/progress patterns where available; color alone never conveys whether
a source is Wiki, external, eligible, or failed.
