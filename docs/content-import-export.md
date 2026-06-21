# Content Import and Export

Administrators manage portable backups and migrations at `/admin/transfers`.
Editors and readers cannot access transfer sources, runs, archives, or reports.

## Portable archive

Site export creates a versioned ZIP containing `manifest.json`, published page
Markdown with YAML frontmatter, content-addressed referenced images, and an
export report. Drafts, deleted pages, users, permissions, comments, revision
history, and system settings are excluded.

Uploaded archives are streamed to the persistent content volume, validated
before mutation, and previewed with either `skip` or `replace` conflict
handling. Replacement appends a published revision and preserves prior target
revisions.

Artifacts default to 72-hour retention. Configure:

```dotenv
TRANSFER_ARTIFACT_BASE_PATH=/data/content/transfers
TRANSFER_ARTIFACT_RETENTION_HOURS=72
TRANSFER_MAX_COMPRESSED_BYTES=2147483648
TRANSFER_MAX_EXPANDED_BYTES=4294967296
TRANSFER_MAX_ENTRIES=50000
```

## Wiki.js migration

Create a Wiki.js source with its base URL and API token. The token requires
permission to list pages and read page source. Credentials are encrypted and
never returned by the API.

Markdown is preserved. CKEditor/HTML pages are converted to Markdown and marked
as converted. Referenced images are downloaded, validated, stored locally, and
rewritten to target asset URLs. Credentials are sent only to the configured
Wiki.js origin.

Private network destinations are blocked by default. Enable private-network
trust only for a known Wiki.js host; the exception does not apply to arbitrary
cross-origin images.

## Recovery

Runs and item outcomes remain in PostgreSQL after browser refreshes and artifact
expiry. Active runs can be cancelled cooperatively. Failed and cancelled runs
can create retries without deleting historical outcomes. Only one mutating
import can hold the database mutation slot at a time.

Use the run detail page to inspect sanitized failures and download available
archives. API activity is recorded by the existing API audit middleware.
