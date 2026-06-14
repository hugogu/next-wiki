# Quickstart: Core Wiki Platform

**Feature**: `001-core-wiki-platform`

End-to-end verification script for the read/author/admin core. Satisfies the
spec's success criteria SC-001 through SC-008. Run after the tasks for this
feature are implemented.

## 0. Prerequisites

- Docker + Docker Compose
- Node.js 20.9+ and pnpm (only needed for local dev/tests)

## 1. One-command deploy (SC-001)

```bash
docker compose up -d --build
# App runs migrations idempotently on startup, then exposes the wiki.
```

Open `http://localhost:3000`. The wiki home renders with an empty published-page
list. Target: working wiki within 5 minutes of `docker compose up`.

## 2. First-run admin (constitution P10)

- With zero admins, visiting the site presents the first-run setup.
- Create the initial admin (email + password). The setup route then disables
  itself (DB-gated).
- Sign in as admin.

## 3. Read flow (anonymous) — SC-002, SC-008

```bash
# After at least one published page exists:
curl -sI http://localhost:3000/<slug>          # 200, served HTML
curl -s http://localhost:3000/<slug> | grep -q "<h1"  # pre-rendered HTML present
```

Manual: in a fresh browser (no login) open `/`, click a published page, and use
browser back / forward / refresh / right-click "open in new tab" / paste a deep
link — every action lands on the correct page with no error. (Automated by the
Playwright no-SPA suite — research D11.)

## 4. Register + login — SC-003

- Open `/auth/register`, create a reader account (default role), land on `/`.
- Sign out, sign back in via `/auth/login`. Target: < 1 minute total.

## 5. Author + publish — SC-004, SC-005

- As admin, promote the test user to **editor** (`/admin/users`).
- Sign in as editor, open `/new`, choose a slug, type Markdown, save (creates a
  draft revision). Confirm the page is **not** visible to a reader/anon yet.
- Publish the revision. Confirm a reader now sees it at `/<slug>`.
- Edit the page (new draft); confirm the reader still sees the previous
  published content until the new revision is published.
- Open `/<slug>/history`; confirm both versions are listed. Target: < 2 minutes
  to create + publish.

## 6. Access control — SC-006

- As a reader, attempt by direct URL: `/<draft-slug>`, `/<slug>/edit`,
  `/<slug>/revisions/<n>` (draft), `/admin/users`. Each returns access-denied /
  not-found **without confirming the resource exists**.

## 7. Admin user management — US5

- As admin at `/admin/users`: view users, change a role, reset a password.
- Confirm the reset user must set a new password on next login (D9).
- Confirm a role change takes effect on the user's next request (D8) — promote
  a reader to editor mid-session and verify edit access appears without re-login.

## 8. Health + operations (constitution P10)

```bash
curl -fsS http://localhost:3000/healthz           # process + DB healthy
curl -fsS http://localhost:3000/readyz             # post-migration readiness
```

## 9. Automated verification

```bash
pnpm install
pnpm --filter web test          # Vitest unit/integration
pnpm --filter web test:e2e      # Playwright: no-SPA nav contract + role/publish flows
```

## 10. Backup / restore smoke (constitution P10)

```bash
docker compose exec db pg_dump -U wiki wiki > backup.sql
# restore into a fresh DB container per docs, confirm data intact
```

## Definition of Done for this feature

- All steps 1–8 succeed; steps 9–10 green.
- Playwright no-SPA suite passes on 100% of navigable routes (SC-008).
- No constitution anti-pattern introduced (verified per PR checklist).
