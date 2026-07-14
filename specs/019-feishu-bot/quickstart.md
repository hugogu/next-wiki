# Quickstart: Validate Feishu Bot Integration

This guide validates the feature against a local Docker Compose deployment and a
mocked Feishu WebSocket/message transport. It does not connect to a production
Feishu tenants.

## Prerequisites

- Node.js and pnpm versions supported by the repository.
- Docker Compose.
- A generated local `API_KEY_ENCRYPTION_KEY`.
- Feishu mock credentials: app ID and app secret. Test values only; do not add
  them to source control.
- A seeded active Wiki user, a readable published page, an unreadable/private page
  when ACL fixtures are available, and an admin user.

## Start the stack

1. Install workspace dependencies if they are not already present.
2. Start the normal Wiki stack. No Feishu service, callback URL, or public
   ingress is required because the web process establishes the outbound
   WebSocket connection:

   ```sh
   docker compose up -d --build
   ```

3. Confirm the web readiness endpoint and integration health in the
   canonical Feishu admin integration page.
4. In `/admin/feishu`, generate a QR code and scan it with Feishu. Choose either
   an existing application or a new application in the native Feishu screen.
   Verify that the response never includes a device code or App Secret and that
   the WebSocket connection becomes active automatically.

## Binding and Q&A

1. Dispatch a direct-message fixture from an unbound `open_id` through the SDK
   event normalization boundary.
   Expect one private binding-link disposition and no Q&A action.
2. Open the link as the intended Wiki user, confirm the binding, and verify that a
   second attempt to use the same link fails. Advance the clock past 10 minutes and
   verify expiry.
3. Dispatch a direct question from the bound `open_id`. Expect acknowledgement
   within three seconds, an AI action attributed to the bound Wiki user, and a
   direct answer with at least one readable citation.
4. Send the same event again. Expect an idempotent no-op: no additional action,
   binding, or sent answer.
5. In a group fixture, @-mention the bot as a bound user. Verify that only that
   sender's session and permission context are used; another participant's prior
   context is absent.
6. Revoke the binding, disable the user, or remove the AI entitlement while the
   action is queued. Expect a safe direct failure and no source disclosure.

## Notifications

1. Configure a direct subscription for an active bound user. Complete an AI action
   and verify one direct completion card with a permission-valid deep link.
2. Configure a `public_safe_group` page-published subscription. Publish a public
   page and verify one group card. Change the resource to non-public before delivery
   and verify the group receives neither title, link, nor count.
3. Configure a `private_recipients_group` transfer subscription. Use fixtures with
   authorized, unauthorized, and unbound group members. Verify only the authorized
   bound users receive direct cards and the group receives no summary.
4. Stop the web app, emit a notification, then restart it. Verify the durable
   delivery is claimed and sent within the configured retention window.
5. Force five retryable send failures. Verify the subscription is paused/failing and
   visible to admins. Advance beyond expiry and verify an explicit `expired`
   delivery record rather than a silent drop.

## Audit and security

1. Submit a malformed SDK event and a replayed event. Expect the malformed event
   to be ignored before business processing and a duplicate-safe response for the
   replay.
2. Inspect audit records for each accepted bot request. Verify the resolved Wiki
   user, `origin=feishu`, outcome, and opaque correlation ID; verify raw prompts,
   answers, tokens, app secret, and Feishu identifiers are absent.
3. Attempt a private API request with no/incorrect bot credential and with a
   caller-supplied Wiki user ID. Expect rejection and no binding/resource disclosure.

## Automated checks

Run the feature's targeted Vitest and Playwright suites, followed by:

```sh
pnpm lint
pnpm typecheck
pnpm test
docker compose up -d --build
```

Before merging, run `pnpm db:generate` after schema edits and run it once more
without changes to confirm `No schema changes, nothing to migrate`. Review the
generated migration and snapshot; do not hand-author Drizzle migration files.
