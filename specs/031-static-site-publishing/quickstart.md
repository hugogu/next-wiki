# Quickstart: Static Site Publishing

**Feature**: `031-static-site-publishing` | **Date**: 2026-07-31

Two paths: the operator publishing a wiki to GitHub Pages, and the developer
verifying the feature locally.

---

## Operator path

### 1. Prepare the destination

Create (or pick) a repository the wiki may write to, and decide a branch that
belongs entirely to this feature — the wiki replaces that branch's whole tree on
every publish, so do not point it at a branch holding anything else.

Give the wiki write access one of two ways:

- **HTTPS token**: create a fine-grained token with contents write access to
  that repository.
- **SSH deploy key**: skip ahead to step 2 and let the wiki generate the
  keypair, then install the public half as a deploy key with write access.

### 2. Configure the target

Open **Admin → Static site**. This is a different feature from Admin → Storage →
Git export: Git export writes raw Markdown for backup, this publishes a readable
website. Enabling one has no effect on the other.

Enter:

| Field | Example | Notes |
|---|---|---|
| Repository | `https://github.com/owner/wiki-site.git` | HTTPS or SSH, no credentials in the URL. |
| Branch | `gh-pages` | Owned by this feature. |
| Public address | `https://owner.github.io/wiki-site/` | Must match what GitHub Pages will serve. Its path is what makes sub-path hosting work — get this right or every link breaks. |
| Auth | token or SSH | For SSH, generate the key here and install the shown public key as a deploy key. |

Save without enabling first if you want to review the eligibility summary before
anything is published.

### 3. Review what will be published

The panel shows how many pages are publishable and how many are excluded,
grouped by reason. Read this before the first publish.

A page is published only when **all** of these hold:

- it is not deleted,
- it has a published revision,
- its visibility is public,
- its space allows anonymous reading,
- its space is an ordinary wiki space.

Raw-capture and generated-knowledge spaces are never published, even if their
visibility settings would allow it. To publish that material, promote it into an
ordinary wiki page first.

### 4. Publish

Enable the target, or press **Publish now**. The run is queued immediately and
proceeds in the background; the panel shows its status, then the page and asset
counts and a link to the live site.

### 5. Point GitHub Pages at the branch

In the repository's **Settings → Pages**, choose "Deploy from a branch" and
select the branch you configured, folder `/ (root)`. Nothing else is needed —
the wiki writes `.nojekyll`, so GitHub serves the files as-is without running
Jekyll.

Wait for the first deployment, then open the public address.

### 6. Keep it current

- **Publish on change**: republishes whenever content is published, unpublished,
  deleted, renamed, moved, or has its visibility changed.
- **Scheduled**: republishes on an interval.
- Neither is required; manual publishing alone is fully supported.

### Taking the site down

**Remove public site** deletes the published content from the branch, so the
public addresses stop serving. You confirm by typing the branch name. This is
separate from deleting the target configuration, which destroys the stored
credential but leaves whatever is already published in place.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every link and image 404s | Public address path does not match how the host serves the site | Correct the public address (for a project site it must include the repository path) and republish. |
| Publish fails naming a credential | Token expired or deploy key removed | Re-enter the credential. The previously published site is untouched. |
| Publish fails naming two paths | Two page paths differ only in letter case | Rename one — the host's filesystem cannot distinguish them. |
| Publish fails on size | Artifact exceeds host limits | Reduce large assets. The site is not partially updated; the previous one is still served. |
| A page is missing from the site | It fails one of the five eligibility conditions | Check the exclusion summary, which groups by reason. |
| Search finds nothing | Index step failed | The run reports this as a failure rather than shipping a site with dead search; check the run's error. |
| "Static site assets are missing" | The image predates the asset build step, or the process runs from an unexpected directory | Rebuild the image (`docker compose build --no-cache web`). For a local checkout run `pnpm --filter @next-wiki/web build:static-site-assets`. If the assets live elsewhere, set `STATIC_SITE_ASSETS_DIR`. |

---

## Developer path

### Build the static assets

The stylesheet and client runtime are build-time artifacts, not per-publish
work:

```bash
pnpm --filter @next-wiki/web build:static-site-assets
```

This compiles `globals.css` through the Tailwind CLI and bundles the client
runtime with esbuild, writing content-hashed files the publish job copies into
each snapshot verbatim.

### Run the test suites

```bash
pnpm --filter @next-wiki/web test
```

The release-blocking test is the leak assertion: it generates a snapshot from a
fixture wiki containing restricted pages, non-anonymous spaces, raw and
generated spaces, and cross-links into all of them, then scans every byte of the
artifact for anything that should not be there. Treat a failure here as a
release blocker, never as a test to adjust.

### Verify a snapshot by hand

Generate into a temp directory, then serve it with any static file server and
browse with the wiki stopped — that is the only honest check that the artifact
is genuinely self-contained (FR-020). Confirm navigation, anchors, dark mode, a
Chinese search query, and language switching all work with the wiki unreachable.

### E2E

```bash
pnpm --filter @next-wiki/web test:e2e
```

Stop any preview or manually started dev server first — leftover servers starve
the suite of CPU and produce failures that look like regressions.

### Schema changes

Edit `apps/web/src/server/db/schema/index.ts`, then:

```bash
pnpm db:generate
```

Never hand-write the migration SQL or edit `meta/_journal.json`. Run
`pnpm db:generate` a second time with no further edits and confirm it reports no
schema changes.
