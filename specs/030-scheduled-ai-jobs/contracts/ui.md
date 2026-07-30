# UI Contract: Scheduled AI Jobs

## Canonical routes and access

| Resource | Route | Access |
| --- | --- | --- |
| Jobs collection | `/admin/ai/jobs?tab=jobs` | Admin with `manage_ai` |
| Cross-job runs | `/admin/ai/jobs?tab=runs` | Admin with `manage_ai` |
| Job definition | `/admin/ai/jobs/{id}` | Admin with `manage_ai` |
| Run detail | `/admin/ai/jobs/{id}/runs/{runId}` | Admin with `manage_ai` |

`/admin/ai/jobs` is the one navigation entry in the existing AI Admin group. It uses the same server-side access check/not-found behavior as other Admin AI pages. Direct routes, inactive tabs, filters, sort, pagination, and selected view state are URL-restorable; dialogs used only to confirm a mutation remain transient. Definition/run detail includes the standard breadcrumb and back link.

## Definition list and form

The collection uses existing `Layout admin`, `SettingsTabs`, `DataTable`, `Pagination`, `Button`, `Input`, `Select`, `Switch`, `Tooltip`, `ModalDialog`, and confirmation primitives.

The definitions list shows name, enabled/paused/retired status, readable schedule/time zone, scope summary, execution owner, last safe outcome, and next run. It supports URL-backed text/status filters and paging. Actions are placed in the page header or row action area; they do not consume reader/content space.

The create/edit form uses existing form/validation patterns and presents:

- name and task-description textarea;
- cron schedule plus time zone and human-readable next occurrence preview;
- execution owner selection from active AI-eligible users;
- structured scope selection with clear readable boundaries;
- enabled/paused state and safe explanatory hints;
- save, duplicate, pause/resume, run now, and retire controls appropriate to state.

Field errors are inline/localized. Saving neither waits for a model nor starts a run unless the Admin explicitly chooses Run now. Retire and cancellation require the existing confirmation dialog pattern.

## Run lists and detail

The per-job and cross-job run lists reuse translation/action list patterns: status badge, trigger, start/finish time, definition version, safe result/error summary, and stable detail link. Active state refreshes through the established TanStack Query/polling pattern at a short bounded interval; terminal runs stop polling.

Run detail has sections for definition snapshot, schedule occurrence/trigger, execution owner, status/timing/usage, bounded progress/outcome, and related permitted resources. It links to the existing proposal detail and page draft/revision/diff route; it never embeds duplicate approval/apply controls. Related links, evidence, tool command summaries, and page references are resolved/redacted at read time. Errors use safe localized language and never render secrets, raw prompts beyond the configured task description, or arbitrary tool results.

## Visual and localization rules

- Extend both `messages/en.json` and `messages/zh.json` with matching job/run/status/validation/error labels, then validate the i18n catalog.
- Reuse Admin AI typography, spacing, token colors, status icons, empty states, table layout, tooltips, and accessible labels. No hardcoded visual token or duplicate UI primitive.
- Empty states distinguish “no definitions,” “no matching runs,” “paused,” and safe “blocked/unavailable” conditions without exposing inaccessible resources.
- Public reader pages, page bodies, public navigation, and AI chat layout are unchanged. Job management/progress is never rendered in anonymous/ISR document output.
