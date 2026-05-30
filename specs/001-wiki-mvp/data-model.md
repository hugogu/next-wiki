# Data Model: Wiki MVP Foundation

## Overview

The MVP schema covers every persistent domain required by the revised spec:
authentication and external identity links, sessions, groups and permissions,
spaces, multilingual pages, immutable revisions, redirects, outbound links,
tags, assets, theme configuration, AI provider settings, AI knowledge records,
AI conversations, API tokens, and background task status.

## Entities

### User

- Purpose: Represents a reader, editor, administrator, or AI chat participant.
- Key fields:
  - `id`
  - `email`
  - `displayName`
  - `avatarUrl`
  - `status` (`invited`, `active`, `suspended`)
  - `preferredLocale`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Has many `UserIdentity`
  - Has many `Session`
  - Has many `GroupMembership`
  - Has many `PageRevision`
  - Has many `Asset`
  - Has many `AIConversation`
  - Has many `ApiToken`
  - Has many `BackgroundTask`
- Validation rules:
  - Email unique when present
  - Suspended users cannot create revisions, uploads, or AI messages

### UserIdentity

- Purpose: Links a local user record to an authentication source.
- Key fields:
  - `id`
  - `userId`
  - `providerType` (`local`, `oidc`, `ldap`, `saml`)
  - `providerKey`
  - `externalSubject`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Belongs to `User`
- Validation rules:
  - Unique on `(providerType, providerKey, externalSubject)`

### Session

- Purpose: Represents an authenticated browser or device session.
- Key fields:
  - `id`
  - `userId`
  - `expiresAt`
  - `createdAt`
  - `lastSeenAt`
- Relationships:
  - Belongs to `User`

### AuthProvider

- Purpose: Stores administrator-configured external identity provider settings.
- Key fields:
  - `id`
  - `providerType` (`oidc`, `ldap`, `saml`)
  - `key`
  - `label`
  - `status` (`disabled`, `enabled`, `error`)
  - `config`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Referenced by `UserIdentity`
- Validation rules:
  - Key unique per provider type
  - Sensitive credentials encrypted at rest

### Group

- Purpose: A reusable permission subject for teams and roles.
- Key fields:
  - `id`
  - `key`
  - `name`
  - `description`
  - `isSystem`
  - `createdAt`
- Relationships:
  - Has many `GroupMembership`
  - Has many `PermissionRule`
- Validation rules:
  - Group key unique and stable

### GroupMembership

- Purpose: Joins users to groups.
- Key fields:
  - `id`
  - `userId`
  - `groupId`
  - `role`
  - `joinedAt`
- Relationships:
  - Belongs to `User`
  - Belongs to `Group`
- Validation rules:
  - Unique on `(userId, groupId)`

### Space

- Purpose: Top-level wiki boundary for hierarchy, locale defaults, and access.
- Key fields:
  - `id`
  - `key`
  - `name`
  - `description`
  - `defaultLocale`
  - `isPublicByDefault`
  - `navigationMode`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Has many `Page`
  - Has many `PermissionRule`
- Validation rules:
  - Key unique
  - Default locale must be one of the enabled site locales

### TranslationGroup

- Purpose: Connects localized page records that represent the same conceptual page.
- Key fields:
  - `id`
  - `createdAt`
- Relationships:
  - Has many `Page`

### Page

- Purpose: Current mutable representation of a wiki page in one locale.
- Key fields:
  - `id`
  - `spaceId`
  - `translationGroupId`
  - `path`
  - `locale`
  - `title`
  - `summary`
  - `status` (`draft`, `published`, `archived`, `deleted`)
  - `currentRevisionId`
  - `createdByUserId`
  - `updatedByUserId`
  - `deletedAt`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Belongs to `Space`
  - Belongs to `TranslationGroup`
  - Belongs to current `PageRevision`
  - Has many `PageRevision`
  - Has many `PageTag`
  - Has many `PageLink`
  - Has many `PageRedirect`
  - Has many `PermissionRule`
  - Has many `AssetReference`
- Validation rules:
  - Unique on `(spaceId, path, locale)`
  - Path normalized and rooted
  - Soft-deleted pages remain recoverable during retention

### PageRevision

- Purpose: Immutable snapshot of page source and metadata at save time.
- Key fields:
  - `id`
  - `pageId`
  - `revisionNumber`
  - `title`
  - `sourceFormat`
  - `sourceContent`
  - `contentHash`
  - `changeSummary`
  - `authoredByUserId`
  - `createdAt`
- Relationships:
  - Belongs to `Page`
  - Belongs to `User`
  - Has many `AIKnowledgeRecord`
- Validation rules:
  - Unique on `(pageId, revisionNumber)`
  - Immutable after creation

### PageLink

- Purpose: Stores a page's outbound internal links for validity and backlinks.
- Key fields:
  - `id`
  - `sourcePageId`
  - `sourceRevisionId`
  - `targetSpaceKey`
  - `targetPath`
  - `targetLocale`
  - `linkText`
  - `status` (`valid`, `broken`, `redirected`, `unknown`)
  - `createdAt`
- Relationships:
  - Belongs to source `Page`
  - Belongs to source `PageRevision`
- Validation rules:
  - Recomputed when source revisions change

### PageRedirect

- Purpose: Preserves moved page paths and locale-safe redirect behavior.
- Key fields:
  - `id`
  - `spaceId`
  - `fromPath`
  - `toPath`
  - `createdAt`
- Relationships:
  - Belongs to `Space`
- Validation rules:
  - Unique on `(spaceId, fromPath)`
  - Always points to the final target, never an intermediate redirect

### Tag

- Purpose: Reusable content label for discovery and grouping.
- Key fields:
  - `id`
  - `slug`
  - `label`
  - `description`
  - `colorToken`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Has many `PageTag`
- Validation rules:
  - Slug unique site-wide

### PageTag

- Purpose: Join entity between pages and tags.
- Key fields:
  - `id`
  - `pageId`
  - `tagId`
  - `assignedByUserId`
  - `assignedAt`
- Relationships:
  - Belongs to `Page`
  - Belongs to `Tag`
- Validation rules:
  - Unique on `(pageId, tagId)`

### Asset

- Purpose: Stored media, file, or diagram artifact managed by the wiki.
- Key fields:
  - `id`
  - `storageKind` (`local`, `object`)
  - `path`
  - `originalFilename`
  - `mimeType`
  - `byteSize`
  - `checksum`
  - `kind` (`image`, `document`, `diagram-source`, `theme-asset`, `other`)
  - `uploadedByUserId`
  - `createdAt`
- Relationships:
  - Belongs to `User`
  - Has many `AssetReference`
- Validation rules:
  - Path unique per storage backend
  - Binary payload immutable after upload

### AssetReference

- Purpose: Tracks how assets are attached to pages or themes.
- Key fields:
  - `id`
  - `assetId`
  - `ownerType` (`page`, `theme`)
  - `ownerId`
  - `referenceRole` (`inline`, `attachment`, `diagram-source`, `logo`, `favicon`)
  - `createdAt`
- Relationships:
  - Belongs to `Asset`

### PermissionRule

- Purpose: Declarative allow or deny entry for a user or group over a resource.
- Key fields:
  - `id`
  - `subjectType` (`user`, `group`)
  - `subjectId`
  - `resourceType` (`site`, `space`, `page`, `asset`, `ai`, `integration`)
  - `resourceId`
  - `action`
  - `effect` (`allow`, `deny`)
  - `createdAt`
- Relationships:
  - References either `User` or `Group`
- Validation rules:
  - Duplicate identical rules rejected

### Theme

- Purpose: Site-wide appearance configuration backed by design tokens.
- Key fields:
  - `id`
  - `key`
  - `name`
  - `status` (`draft`, `active`, `archived`)
  - `origin` (`system`, `custom`)
  - `tokenSet`
  - `chromeConfig`
  - `createdByUserId`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Belongs to `User`
  - Has many `AssetReference`
- Validation rules:
  - Only one theme active site-wide

### SiteSetting

- Purpose: Stores site-wide operational and presentation settings.
- Key fields:
  - `id`
  - `key`
  - `value`
  - `valueType`
  - `updatedByUserId`
  - `updatedAt`
- Relationships:
  - Belongs to `User`
- Validation rules:
  - Key unique site-wide
  - Sensitive values encrypted at rest

### ApiToken

- Purpose: Scoped token for public REST and optional MCP access.
- Key fields:
  - `id`
  - `label`
  - `tokenHash`
  - `scopeSet`
  - `status` (`active`, `revoked`)
  - `createdByUserId`
  - `createdAt`
  - `lastUsedAt`
- Relationships:
  - Belongs to `User`
- Validation rules:
  - Scope set includes only supported scopes such as `read`, `write`, `admin`

### AIProvider

- Purpose: Administrator-managed AI service configuration.
- Key fields:
  - `id`
  - `key`
  - `label`
  - `providerType`
  - `status` (`disabled`, `enabled`, `error`)
  - `capabilities`
  - `endpoint`
  - `encryptedCredentials`
  - `defaultModel`
  - `embeddingModel`
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Has many `AIKnowledgeRecord`
  - Has many `AIConversation`
- Validation rules:
  - Disabled providers cannot be selected for new work
  - Credentials encrypted at rest

### AIKnowledgeRecord

- Purpose: Derived retrieval and summarization record for a page revision.
- Key fields:
  - `id`
  - `pageRevisionId`
  - `providerId`
  - `indexVersion`
  - `summary`
  - `embeddingRef`
  - `entities`
  - `citationAnchors`
  - `ingestionStatus` (`pending`, `ready`, `failed`)
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Belongs to `PageRevision`
  - Belongs to `AIProvider`
- Validation rules:
  - Multiple index versions may coexist during rebuilds

### AIConversation

- Purpose: Persistent chat thread scoped to wiki context.
- Key fields:
  - `id`
  - `userId`
  - `providerId`
  - `contextType` (`global`, `space`, `page`)
  - `contextId`
  - `title`
  - `status` (`active`, `archived`, `deleted`)
  - `createdAt`
  - `updatedAt`
- Relationships:
  - Belongs to `User`
  - Belongs to `AIProvider`
  - Has many `AIConversationMessage`

### AIConversationMessage

- Purpose: User or assistant message inside a conversation.
- Key fields:
  - `id`
  - `conversationId`
  - `role` (`user`, `assistant`, `system`)
  - `body`
  - `status` (`pending`, `completed`, `failed`)
  - `generatedDraftPageId`
  - `createdAt`
- Relationships:
  - Belongs to `AIConversation`
  - Has many `AICitation`
- Validation rules:
  - Completed assistant answers require citations when they answer wiki questions

### AICitation

- Purpose: Connects AI answers to the page revisions used as evidence.
- Key fields:
  - `id`
  - `messageId`
  - `pageRevisionId`
  - `excerptLocator`
  - `orderIndex`
- Relationships:
  - Belongs to `AIConversationMessage`
  - Belongs to `PageRevision`

### BackgroundTask

- Purpose: User-visible status record for long-running work.
- Key fields:
  - `id`
  - `taskType`
  - `requestedByUserId`
  - `resourceType`
  - `resourceId`
  - `status` (`queued`, `running`, `completed`, `failed`, `cancelled`)
  - `progressLabel`
  - `errorSummary`
  - `createdAt`
  - `startedAt`
  - `finishedAt`
- Relationships:
  - Belongs to `User`
- Validation rules:
  - Finished task history remains auditable

## Key Relationships

- `Space` 1-to-many `Page`
- `TranslationGroup` 1-to-many `Page`
- `Page` 1-to-many `PageRevision`
- `Page` many-to-many `Tag` through `PageTag`
- `Page` 1-to-many `PageLink`
- `Page` 1-to-many `PageRedirect`
- `User` many-to-many `Group` through `GroupMembership`
- `User` 1-to-many `UserIdentity`
- `User` 1-to-many `Session`
- `User` and `Group` are both permission subjects through `PermissionRule`
- `AIProvider` 1-to-many `AIConversation`
- `PageRevision` 1-to-many `AIKnowledgeRecord`
- `AIConversation` 1-to-many `AIConversationMessage`
- `AIConversationMessage` 1-to-many `AICitation`

## State Transitions

### Page

- `draft -> published`
- `published -> draft`
- `published -> archived`
- `draft -> deleted`
- `archived -> published`
- `deleted -> draft` through restore

### Theme

- `draft -> active`
- `active -> archived`
- `archived -> draft`

### AI Provider

- `disabled -> enabled`
- `enabled -> error`
- `error -> enabled`
- `enabled -> disabled`

### Background Task

- `queued -> running`
- `running -> completed`
- `running -> failed`
- `queued -> cancelled`

## Derived and Indexed Data

- Full-text search indexes are derived from page save operations and honor locale.
- Outbound link records are derived from rendered or parsed page source.
- AI knowledge records are derived from page revisions and can be rebuilt.
- Theme token sets are structured configuration, not executable code.
