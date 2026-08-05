# Cross-Space Migration UI Contract

## Shared dialog

The Navigator and Pages list launch one shared migration dialog. It owns these
states: source summary, destination space/folder selection, preview loading,
preview results, exclusions/re-preview, confirmation, queued/running status,
and terminal outcome.

The dialog shows the selected count, destination mappings, any generated-format
or metadata adaptation, visibility outcome, references requiring review, and
conflicts before enabling confirmation. It does not infer authorization from a
visible row; every preview is server-authorized.

## Navigator Pane

- Page rows expose the action from an accessible contextual/overflow control.
- Folder rows expose the same control using their path prefix; virtual folders
  do not require a fabricated database identity.
- The action is unavailable outside LLM Wiki mode, for Raw, and for callers
  without Administrator authority.
- On a single-page success, navigate to the server-returned canonical
  destination URL. On a folder terminal state, refresh/re-key the lazy tree
  cache before showing its result so stale source branches do not persist.

## Pages list

- The per-row migration action replaces the narrow opposite-space button.
- It launches the same dialog and supports an explicit destination folder,
  preview, and durable status rather than posting a synchronous move.
- This release does not add bulk selection of unrelated list rows; Navigator
  folder selection is the grouped migration surface.

## URL and accessibility

- The main list filters, sort, and pagination remain in URL search parameters.
- The dialog has a labelled title, focus management, keyboard-operable controls,
  and status announced while the operation is running.
- It is an action overlay, not a second route or duplicate page-management
  entry. The resulting page continues to have only its canonical reader/editor
  URLs.
