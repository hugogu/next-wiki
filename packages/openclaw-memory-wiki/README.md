# @next-wiki/openclaw-memory-wiki

Native OpenClaw plugin that mirrors eligible `.md` files from the OpenClaw
Memory Wiki vault into next-wiki's account-bound Raw space and adds a bundled
Skill for account-wide Wiki/Raw/Generated retrieval.

Install the packed plugin with `openclaw plugins install <tarball>`. Configure
`baseUrl`, `vaultPath`, and two OpenClaw SecretRefs: the mirror key returned by
the next-wiki OpenClaw key preset, and the separate knowledge-search key. Keep
both keys out of ordinary config files. The mirror key writes only the bound
source-document destination; the search key is read-only and its Raw/Generated
access is explicit and admin-controlled.

The scanner preserves each Markdown file's bytes, frontmatter, links, and
relative source path in immutable next-wiki Revisions. Re-running a scan with
the same digest is unchanged; changing a file creates one new current Revision.
Attachments and `.openclaw-wiki` state are excluded. A failed upload is retried
with bounded backoff and remains visible as degraded status for manual repair.

The plugin never modifies the local vault, OpenClaw active-memory records, or
the Memory Wiki compiler.
