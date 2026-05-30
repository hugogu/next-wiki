# Quickstart: Wiki MVP Foundation

## Goal

Bring up the MVP locally with Docker, complete first-run setup, verify
authentication and permissions, create multilingual linked pages with revision
history, validate search and redirects, apply a theme, and enable AI chat.

## Prerequisites

- Docker and Docker Compose available on the host
- Environment file created from the project sample configuration
- Optional AI provider credentials if AI chat should be exercised
- Optional external auth provider test credentials if enterprise auth should be
  validated locally

## 1. Start the stack

```bash
docker compose up --build
```

Expected outcome:

- PostgreSQL starts with persisted volumes
- The web application starts
- The worker process starts
- Health and readiness endpoints become available

## 2. Complete first-run setup

1. Open the local application URL exposed by the container setup.
2. Complete the initialization flow.
3. Create the initial administrator account.
4. Confirm site name, default locale, and public access defaults.

Expected outcome:

- Administrator session is created
- Site settings persist after refresh
- Administration surfaces become available

## 3. Verify authentication setup

1. Sign out and sign back in with the local administrator account.
2. Optionally configure one external auth provider.
3. Perform one first-time sign-in through that provider.

Expected outcome:

- Local sign-in works
- External sign-in creates or links a local user record
- Permission context is applied after sign-in

## 4. Create foundational wiki content

1. Create a new space.
2. Create a page at a nested path such as `/engineering/platform/overview`.
3. Add:
   - Markdown headings and links
   - an internal wiki link to another page path
   - a Mermaid diagram
   - LaTeX math
   - a draw.io-backed diagram reference
4. Assign multiple tags.
5. Save the page twice with visible changes.

Expected outcome:

- The page renders correctly in read mode
- Internal links are marked valid or invalid
- Tags are visible and filterable
- At least two revisions are available for inspection and restore

## 5. Validate search, redirects, and translations

1. Search for content by keyword.
2. Move one page to a different path.
3. Visit the old path.
4. Create a translation for one page in a second locale.
5. Request a missing locale for that page.

Expected outcome:

- Search returns only readable pages
- The old path redirects to the new path when authorized
- The new path becomes canonical
- Missing translations fall back to the space default locale with a visible notice

## 6. Validate permission behavior

1. Create a non-admin user and group.
2. Apply a space default permission.
3. Apply an explicit allow or deny on one page.
4. Move that page to another space.

Expected outcome:

- Permission precedence behaves as expected
- Page moves clear page-level overrides and inherit from the destination space
- Search, redirects, and AI retrieval only expose readable content

## 7. Validate theme controls

1. Open the site appearance administration area.
2. Activate or edit a theme.
3. Revisit the reading view, editor shell, and admin shell.

Expected outcome:

- Documentation shell, reading surface, and admin chrome reflect the updated
  token-driven style
- The change persists after refresh and restart

## 8. Configure AI chat

1. Open AI provider settings.
2. Add a provider with chat capability enabled.
3. Trigger content indexing if it is not automatic.
4. Open the AI chat side pane while viewing a page.
5. Ask a question whose answer exists in the wiki.

Expected outcome:

- AI chat is available without leaving the current page
- The answer cites source pages or revisions
- Disabling the provider disables AI behavior without breaking core wiki usage

## 9. Restart validation

```bash
docker compose down
docker compose up
```

Expected outcome:

- Accounts, spaces, pages, tags, revisions, redirects, themes, AI providers,
  conversations, and task history are still present
- The product does not require re-initialization
