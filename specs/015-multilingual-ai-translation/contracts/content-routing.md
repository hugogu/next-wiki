# Contract: Content Language Routing and Caching

## Canonical reader addresses

| Resource | Canonical address | Behavior |
|---|---|---|
| Original page | `/{path}` | Resolves only the source/original page, regardless of interface-language cookie or matching translation. |
| Translation | `/{language}/{path}` | Resolves the enabled two-letter target language in the source page's translation group. |
| Translation unavailable | `/{language}/{path}` | Shows localized unavailable/in-progress state for an authorized source reader; never substitutes another language or original as translated output. |
| Unknown/disabled language | `/{language}/{path}` | Returns not found. |

`language` is a configured lowercase ISO 639-1 content identity, not the UI dictionary locale. Reserved application routes keep their existing precedence and no source URL changes.

## Resolution and authorization

1. Decode and validate path/language.
2. Resolve the original source page by unprefixed path.
3. Resolve a translation only through that source's translation group and locale; unrelated same-path pages cannot qualify.
4. Check source context and translated-page read permission independently before returning title, state, revision, HTML, metadata, or history.
5. Only a current published translation revision is reader-visible. Drafts, failed output, and source-hidden content are never exposed.

## Links, metadata, and discoverability

- Original metadata canonical URL is unprefixed; a translation canonical URL is language-prefixed.
- Alternate-language links include only currently published, readable translations in the group. Original is the default alternate, not a redirect target.
- Internal translated links target a same-language readable translation when current; otherwise they target the original URL. Assets retain existing authorized asset URLs.
- Sitemap policy may emit published translation URLs but never missing/draft/stale-unavailable addresses.

## Render cache contract

- Every published source or translation revision has persisted sanitized `content_html`; raw Markdown is the only editable/canonical input.
- Cacheable public revision reads are keyed by page identity, revision/content hash, and content locale. They never use actor, cookie, or headers as shared-cache input.
- Publication, completed replacement, source stale marking, path move, deletion, or visibility change invalidates relevant source/language path tags before later reads return obsolete content.
- Administrative, draft, history, and access-varying pages stay dynamic or private-cache only.
