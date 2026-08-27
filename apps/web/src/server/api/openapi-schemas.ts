import { z } from 'zod';
import { apiKeyScopeSchema, auditEntrySchema, auditQueryParamsSchema, userViewSchema } from '@next-wiki/shared';

export { apiKeyScopeSchema, auditEntrySchema, auditQueryParamsSchema, userViewSchema };

export const SpaceMigrationPath = z.string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]([a-z0-9_/-]*[a-z0-9])?$/)
  .refine((value) => !value.includes('//'))
  .describe('Canonical page path: lowercase slash-separated segments with no leading, trailing, or consecutive slashes.');

export const SpaceMigrationSelection = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: z.string().uuid() }),
  z.object({ kind: z.literal('folder'), sourceSpaceId: z.string().uuid(), pathPrefix: SpaceMigrationPath }),
]).describe('One page or a folder subtree selected for cross-space migration.');

export const SpaceMigrationPreviewInput = z.object({
  selection: SpaceMigrationSelection,
  destinationSpaceId: z.string().uuid(),
  destinationPathPrefix: SpaceMigrationPath.optional(),
  visibility: z.enum(['public', 'registered', 'restricted']).optional(),
  adaptOkf: z.boolean().optional(),
}).describe('Creates a durable migration preview; confirmation requires its fingerprint.');

export const SpaceMigrationConfirmInput = z.object({ previewId: z.string().uuid(), fingerprint: z.string().min(16) });
export const SpaceMigrationItem = z.object({
  id: z.string().uuid(), pageId: z.string().uuid(), sourcePath: z.string(), destinationPath: z.string(), locale: z.string(),
  status: z.enum(['pending', 'running', 'moved', 'excluded', 'conflicted', 'failed', 'cancelled']),
  warning: z.string().nullable(), failure: z.string().nullable(), canonicalUrl: z.string().nullable().optional(),
});
export const SpaceMigrationPreview = z.object({
  id: z.string().uuid(), fingerprint: z.string(), status: z.literal('previewed'),
  sourceSpace: z.object({ id: z.string().uuid(), slug: z.string(), kind: z.enum(['wiki', 'generated']) }),
  destinationSpace: z.object({ id: z.string().uuid(), slug: z.string(), kind: z.enum(['wiki', 'generated']) }),
  items: z.array(SpaceMigrationItem), warningCount: z.number().int(), expiresAt: z.string().datetime(),
});
export const SpaceMigrationOperation = z.object({
  id: z.string().uuid(), status: z.enum(['previewed', 'queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled']),
  sourceSpaceId: z.string().uuid(), destinationSpaceId: z.string().uuid(), totalItems: z.number().int(), movedItems: z.number().int(),
  warningCount: z.number().int(), failedItems: z.number().int(), cancellationRequested: z.boolean(), failure: z.string().nullable(),
  createdAt: z.string().datetime(), startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(),
});
export const SpaceMigrationItemsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().uuid().optional() });
export const SpaceMigrationIdPathParams = z.object({ id: z.string().uuid().describe('Migration operation identifier.') });
export const SpaceMigrationItemList = z.object({ items: z.array(SpaceMigrationItem), nextCursor: z.string().uuid().nullable() });

/**
 * The schemas below are hand-written literal `z.object(...)` copies of
 * @next-wiki/shared runtime schemas, not re-exports or aliases of them. That
 * duplication is required, not stylistic: next-openapi-gen's Zod scanner only
 * recognizes an exported const whose own initializer is a literal
 * schema-building call. It does not follow a plain `export const X =
 * importedSchema` alias across a workspace package boundary, so aliasing one
 * of these back to its @next-wiki/shared counterpart silently drops it from
 * the generated OpenAPI document instead of erroring. openapi-schemas.test.ts
 * guards these against drifting from the runtime schemas.
 */

export const SetupInput = z
  .object({
    email: z.string().email().describe('Administrator email address for the initial account.'),
    password: z.string().min(8).max(128).describe('Administrator password (8-128 characters).'),
  })
  .describe('First-run setup input, creating the initial administrator account.');

export const RegisterInput = z
  .object({
    email: z.string().email().describe('Email address for the new account.'),
    password: z.string().min(8).max(128).describe('Account password (8-128 characters).'),
  })
  .describe('Registration input.');

export const CreateUserInput = z
  .object({
    email: z.string().email().describe('Email address for the new account.'),
    password: z.string().min(8).max(128).describe('Temporary password (8-128 characters).'),
    role: z.enum(['admin', 'editor', 'reader']).default('reader').describe('Initial account role.'),
  })
  .describe('Administrator-created account input.');

export const UserView = z
  .object({
    id: z.string().uuid().describe('User identifier.'),
    email: z.string().email().describe('Canonical email address.'),
    role: z.enum(['admin', 'editor', 'reader']).describe('Assigned role.'),
    status: z.enum(['active', 'disabled']).describe('Account status.'),
    displayName: z.string().nullable().describe('Display name, or null when unset.'),
    createdAt: z.string().datetime().describe('Account creation timestamp.'),
    lastLoginAt: z.string().datetime().nullable().describe('Most recent successful sign-in, or null.'),
  })
  .describe('User account view.');

export const LoginInput = z
  .object({
    email: z.string().email().describe('Account email address.'),
    password: z.string().min(1).describe('Account password.'),
  })
  .describe('Login credentials.');

export const LoginOutput = z
  .object({
    userId: z.string().describe('Identifier of the authenticated user.'),
    mustResetPassword: z.boolean().describe('Whether the user must set a new password before continuing.'),
  })
  .describe('Login response.');

/**
 * Wiki AI runtime settings are maintained here as a literal schema because
 * next-openapi-gen cannot follow the shared-package validator used at runtime.
 * `openapi-schemas.test.ts` structurally compares this definition with
 * `aiRuntimeSettingsUpdateSchema` and `aiRuntimeSettingsViewSchema`.
 */
export const WikiAiRuntimeSettingsUpdate = z.object({
  anonymousWikiAiEnabled: z.boolean().optional(),
  answerLanguage: z.enum(['model_default', 'follow_question']).optional(),
  toolMaxCalls: z.number().int().min(1).max(1_000).optional(),
  toolResultMaxChars: z.number().int().min(3_000).max(200_000).optional(),
  plannerTemperature: z.number().min(0).max(2).optional(),
  plannerMaxOutputTokens: z.number().int().min(256).max(65_536).optional(),
  assistantSystemPrompt: z.string().max(20_000).nullable().optional(),
  toolSystemPrompt: z.string().max(20_000).nullable().optional(),
  webResearchPolicyPrompt: z.string().max(20_000).nullable().optional(),
  plannerUserPrompt: z.string().max(20_000).nullable().optional(),
  toolAnswerPrompt: z.string().max(20_000).nullable().optional(),
}).describe('Partial update to the Wiki AI runtime configuration.');

export const WikiAiRuntimeSettingsView = z.object({
  params: z.object({
    anonymousWikiAiEnabled: z.boolean(),
    answerLanguage: z.enum(['model_default', 'follow_question']),
    toolMaxCalls: z.number().int(),
    toolResultMaxChars: z.number().int(),
    plannerTemperature: z.number(),
    plannerMaxOutputTokens: z.number().int(),
  }),
  prompts: z.object({
    assistantSystemPrompt: z.string().nullable(),
    toolSystemPrompt: z.string().nullable(),
    webResearchPolicyPrompt: z.string().nullable(),
    plannerUserPrompt: z.string().nullable(),
    toolAnswerPrompt: z.string().nullable(),
  }),
  defaults: z.object({
    assistantSystemPrompt: z.string(),
    toolSystemPrompt: z.string(),
    webResearchPolicyPrompt: z.string(),
    plannerUserPrompt: z.string(),
    toolAnswerPrompt: z.string(),
  }),
}).describe('Wiki AI runtime settings, with stored prompt overrides and effective defaults.');

export const MeOutput = z
  .object({
    id: z.string().describe('Current user identifier.'),
    email: z.string().describe('Current user email address.'),
    role: z.enum(['admin', 'editor', 'reader']).describe('Current user role.'),
    displayName: z.string().nullable().describe('Current user display name, or null when not set.'),
  })
  .describe('Currently authenticated user profile.');

export const SetMyPasswordInput = z
  .object({
    newPassword: z.string().min(8).max(128).describe('New password (8-128 characters).'),
  })
  .describe('Set a new password for the current user (e.g. after a forced reset).');

export const SetRoleInput = z
  .object({
    role: z.enum(['admin', 'editor', 'reader']).describe('Role to assign to the target user.'),
  })
  .describe('Change a user role.');

export const SetStatusInput = z
  .object({
    status: z.enum(['active', 'disabled']).describe('Status to assign to the target user.'),
  })
  .describe('Change a user account status.');

export const ResetPasswordInput = z
  .object({
    tempPassword: z.string().min(8).max(128).describe('Temporary password issued to the user (8-128 characters).'),
  })
  .describe('Administrator-initiated password reset.');

export const UpdateProfileInput = z
  .object({
    displayName: z.string().min(1).max(100).nullable().describe('New display name, or null to clear it.'),
  })
  .describe('Update the current user profile.');

export const ChangeEmailInput = z
  .object({
    email: z.string().email().describe('New email address.'),
  })
  .describe('Change the current user email address.');

export const ChangePasswordInput = z
  .object({
    currentPassword: z.string().min(1).describe('Current password, required to authorize the change.'),
    newPassword: z.string().min(8).max(128).describe('New password (8-128 characters).'),
  })
  .describe('Change the current user password.');

export const UpdatePreferencesInput = z
  .object({
    theme: z
      .enum(['light', 'dark', 'auto'])
      .nullable()
      .optional()
      .describe('Preferred theme, or null to reset to the default.'),
    locale: z.enum(['en', 'zh']).nullable().optional().describe('Preferred locale, or null to reset to the default.'),
    webResearchPreference: z
      .boolean()
      .optional()
      .describe('Whether to use external web research when Wiki evidence is insufficient.'),
  })
  .describe('Update the current user preferences.');

export const PreferencesView = z
  .object({
    theme: z.enum(['light', 'dark', 'auto']).nullable().describe('Preferred theme, or null when using the default.'),
    locale: z.enum(['en', 'zh']).nullable().describe('Preferred locale, or null when using the default.'),
    webResearchPreference: z.boolean().describe('Whether external web research is enabled for this user.'),
  })
  .describe('Current user preferences.');

export const WebResearchConnectionTestResult = z
  .object({
    ok: z.boolean().describe('Whether the configured web-research connector responded successfully.'),
    status: z.enum(['succeeded', 'failed', 'rate_limited', 'timed_out']),
    provider: z.literal('tavily').nullable(),
    latencyMs: z.number().int().nonnegative(),
    providerRequestId: z.string().optional(),
    creditsUsed: z.number().nonnegative().optional(),
    candidateCount: z.number().int().nonnegative().optional(),
    testedAt: z.string(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    actionId: z.string().uuid().describe('Synchronous terminal action retained for audit history.'),
  })
  .describe('Synchronous web-research connector health result.');

export const CreateApiKeyInput = z
  .object({
    name: z.string().min(1).max(100).describe('Human-readable name for the API key.'),
    scopes: z
      .array(z.enum(['view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers', 'manage_tags', 'ai.read', 'ai.image', 'attachments', 'memory.read', 'memory.write', 'memory.delete']))
      .min(1)
      .describe('Permission scopes granted to the key. At least one is required; scopes must be unique.'),
    spaceAccess: z
      .array(z.enum(['wiki', 'raw', 'generated']))
      .optional()
      .describe('Content spaces the key may read, independent of scopes. Defaults to wiki-only; raw/generated require an admin owner.'),
    hermesMemory: z.object({
      displayName: z.string().min(1).max(100).optional(),
      sharedNamespaceId: z.string().uuid().optional(),
    }).optional().describe('Creates or binds the key to an isolated Hermes memory destination. It can only be used with memory scopes.'),
  })
  .describe('Create an API key.');

export const ApiKeyViewList = z
  .array(
    z.object({
      id: z.string().describe('API key identifier.'),
      name: z.string().describe('Human-readable name for the API key.'),
      scopes: z
        .array(z.enum(['view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers', 'manage_tags', 'ai.read', 'ai.image', 'attachments', 'memory.read', 'memory.write', 'memory.delete']))
        .describe('Permission scopes granted to the key.'),
      spaceAccess: z
        .array(z.enum(['wiki', 'raw', 'generated']))
        .describe('Content spaces the key may read, independent of scopes.'),
      keyPrefix: z.string().describe('Non-secret prefix of the key, shown for identification.'),
      createdAt: z.string().describe('Timestamp when the key was created.'),
      revokedAt: z.string().nullable().describe('Timestamp when the key was revoked, or null if still active.'),
      lastUsedAt: z.string().nullable().describe('Timestamp when the key was last used, or null if never used.'),
      hermesMemoryDestination: z.object({
        id: z.string().uuid(),
        displayName: z.string(),
        state: z.enum(['active', 'disabled']),
      }).nullable().optional().describe('Dedicated Hermes memory destination, or null for a normal API key.'),
    }),
  )
  .describe('List of API keys.');

export const ApiKeyCreated = z
  .object({
    id: z.string().describe('API key identifier.'),
    name: z.string().describe('Human-readable name for the API key.'),
    scopes: z
        .array(z.enum(['view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers', 'manage_tags', 'ai.read', 'ai.image', 'attachments', 'memory.read', 'memory.write', 'memory.delete']))
      .describe('Permission scopes granted to the key.'),
    spaceAccess: z
      .array(z.enum(['wiki', 'raw', 'generated']))
      .describe('Content spaces the key may read, independent of scopes.'),
    keyPrefix: z.string().describe('Non-secret prefix of the key, shown for identification.'),
    createdAt: z.string().describe('Timestamp when the key was created.'),
    revokedAt: z.string().nullable().describe('Timestamp when the key was revoked, or null if still active.'),
    lastUsedAt: z.string().nullable().describe('Timestamp when the key was last used, or null if never used.'),
    keySecret: z.string().describe('Full secret key value. Shown only once, at creation time.'),
    hermesMemoryDestination: z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      state: z.enum(['active', 'disabled']),
    }).nullable().optional().describe('Dedicated Hermes memory destination, or null for a normal API key.'),
  })
  .describe('API key creation response, including the one-time secret value.');

export const ApiKeyReveal = z
  .object({
    id: z.string().describe('API key identifier.'),
    keySecret: z.string().describe('Full secret key value.'),
  })
  .describe('API key secret reveal response.');

export const HermesMemoryConnection = z.object({
  apiVersion: z.literal('v1'),
  provider: z.literal('next-wiki'),
  namespace: z.object({ id: z.string().uuid(), displayName: z.string(), state: z.literal('active') }),
  capabilities: z.object({
    recall: z.boolean(),
    save: z.boolean(),
    forget: z.boolean(),
    asynchronousEvidenceCapture: z.boolean(),
    strictCheckpoint: z.boolean(),
    semanticRecall: z.literal(false),
  }),
  limits: z.object({
    maxRecallResults: z.number().int(),
    maxSaveCharacters: z.number().int(),
    maxEvidenceCharacters: z.number().int(),
    maxEvidenceMessages: z.number().int(),
  }),
}).describe('Authenticated Hermes memory provider connection and its dedicated destination.');

export const HermesMemoryDiagnostics = z.object({
  status: z.literal('healthy'),
  apiVersion: z.literal('v1'),
  namespaceState: z.literal('active'),
  grantedScopes: z.array(z.enum(['memory.read', 'memory.write', 'memory.delete'])),
}).describe('Safe non-secret Hermes memory diagnostics.');

export const HermesMemoryRecallInput = z.object({
  query: z.string().min(1).max(4_000),
  limit: z.number().int().min(1).max(10).optional(),
}).describe('Recall query for the caller\'s bound Hermes memory destination.');

export const HermesMemoryCitation = z.object({
  pageId: z.string().uuid(), revisionId: z.string().uuid(), revisionHash: z.string(), title: z.string(),
  canonicalUrl: z.string().url(), createdAt: z.string().datetime(),
});

export const HermesMemoryRecord = z.object({
  memoryId: z.string().uuid(), type: z.enum(['memory', 'evidence']), state: z.enum(['active', 'forgotten']),
  title: z.string(), excerpt: z.string(), citation: HermesMemoryCitation,
  evidence: z.array(z.object({ evidenceId: z.string().uuid(), relation: z.enum(['explicit_save', 'automatic_capture', 'checkpoint']), citation: HermesMemoryCitation })).default([]),
});

export const HermesMemoryRecallResponse = z.object({
  results: z.array(HermesMemoryRecord),
  retrieval: z.object({ mode: z.literal('lexical'), complete: z.boolean(), returned: z.number().int().nonnegative() }),
});

export const HermesMemorySaveInput = z.object({
  idempotencyKey: z.string().min(1).max(128), content: z.string().min(1).max(16_000),
  title: z.string().min(1).max(160).optional(), tags: z.array(z.string().min(1).max(64)).max(10).optional(),
  evidenceIds: z.array(z.string().uuid()).max(20).optional(),
}).describe('Write a memory record to the caller\'s bound destination.');

export const HermesMemorySaveResponse = z.object({ record: HermesMemoryRecord, idempotent: z.boolean() });
export const HermesMemoryForgetInput = z.object({ reason: z.string().min(1).max(500).optional() });
export const HermesMemoryForgetResponse = z.object({
  memoryId: z.string().uuid(),
  state: z.literal('forgotten'),
  forgottenAt: z.string().datetime(),
});

export const HermesMemoryEvidenceInput = z.object({
  idempotencyKey: z.string().min(1).max(128), sessionDigest: z.string().regex(/^[a-f0-9]{32,128}$/), checkpoint: z.boolean(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(64_000) })).min(1).max(100),
}).describe('Queue a durable, idempotent evidence capture for the caller\'s bound destination.');

export const HermesMemoryEvidenceQueued = z.object({
  captureId: z.string().uuid(), status: z.enum(['queued', 'running', 'durable', 'failed', 'cancelled']),
  pollUrl: z.string().describe('Origin-relative API path beginning with /api/v1; resolve it against the configured API URL origin for polling capture status.'), idempotent: z.boolean(),
});

export const HermesMemoryEvidenceStatus = z.object({
  captureId: z.string().uuid(), status: z.enum(['queued', 'running', 'durable', 'failed', 'cancelled']),
  durable: z.boolean(),
  evidence: z.object({ evidenceId: z.string().uuid(), citation: HermesMemoryCitation }).optional(),
  failureCode: z.string().optional(),
});

export const AuditListResponse = z
  .object({
    entries: z
      .array(
        z.object({
          id: z.string().describe('Audit entry identifier.'),
          keyId: z.string().nullable().describe('API key identifier used for the request, or null when not applicable.'),
          keyName: z.string().nullable().describe('API key name used for the request, or null when not applicable.'),
          userId: z.string().nullable().describe('Identifier of the user tied to the request, or null when not applicable.'),
          userEmail: z.string().nullable().describe('Email of the user tied to the request, or null when not applicable.'),
          method: z.string().describe('HTTP method of the request.'),
          path: z.string().describe('Request path.'),
          statusCode: z.number().describe('HTTP response status code.'),
          durationMs: z.number().describe('Request duration in milliseconds.'),
          authStatus: z
            .enum(['authenticated', 'invalid_key', 'revoked_key', 'disabled_user', 'malformed_token'])
            .describe('Outcome of authenticating the request.'),
          errorMessage: z.string().nullable().describe('Error message, or null when the request succeeded.'),
          metadata: z.object({ kind: z.literal('request_log_settings_change'), previous: z.object({ enabled: z.boolean(), level: z.enum(['status', 'header', 'all']), retentionHours: z.number() }), next: z.object({ enabled: z.boolean(), level: z.enum(['status', 'header', 'all']), retentionHours: z.number() }) }).nullable().describe('Non-sensitive metadata for a request-log setting change, or null.'),
          createdAt: z.string().describe('Timestamp when the entry was recorded.'),
        }),
      )
      .describe('Audit entries for the current result window.'),
    total: z.number().describe('Total number of matching audit entries.'),
    page: z.number().describe('Current page number.'),
    pageSize: z.number().describe('Number of entries per page.'),
  })
  .describe('Paginated audit log response.');

export const RequestLogSettingsView = z.object({ enabled: z.boolean(), level: z.enum(['status', 'header', 'all']), retentionHours: z.number().int().min(1).max(168), updatedAt: z.string().nullable(), updatedBy: z.object({ id: z.string(), email: z.string() }).nullable(), allConfirmationRequired: z.literal(true) }).describe('Current global outbound request-log capture settings.');
export const RequestLogSettingsUpdate = z.object({ enabled: z.boolean(), level: z.enum(['status', 'header', 'all']), retentionHours: z.number().int().min(1).max(168), confirmSensitiveCapture: z.boolean().optional() }).describe('Update global outbound request-log capture settings.');
export const RequestLogSummary = z.object({ id: z.string().uuid(), sourceType: z.string(), providerKey: z.string().nullable(), operation: z.string(), attempt: z.number().int(), method: z.string(), targetHost: z.string().nullable(), targetPath: z.string().nullable(), statusCode: z.number().int().nullable(), outcome: z.enum(['success', 'http_error', 'transport_error', 'timeout', 'cancelled', 'invalid_response']), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), providerRequestId: z.string().nullable(), correlationId: z.string().nullable(), model: z.string().nullable(), inputTokens: z.number().int().nullable(), outputTokens: z.number().int().nullable(), cachedInputTokens: z.number().int().nullable(), durationMs: z.number().int().nullable(), captureLevel: z.enum(['status', 'header', 'all']), startedAt: z.string(), completedAt: z.string().nullable(), expiresAt: z.string() }).describe('Non-sensitive summary of one captured outbound request.');
export const RequestLogListResponse = z.object({ entries: z.array(RequestLogSummary), total: z.number().int().nonnegative(), page: z.number().int(), pageSize: z.number().int() }).describe('Paginated outbound request-log summaries.');
export const RequestLogDetailResponse = z.object({ id: z.string().uuid(), sourceType: z.string(), providerKey: z.string().nullable(), operation: z.string(), attempt: z.number().int(), method: z.string(), targetHost: z.string().nullable(), targetPath: z.string().nullable(), statusCode: z.number().int().nullable(), outcome: z.enum(['success', 'http_error', 'transport_error', 'timeout', 'cancelled', 'invalid_response']), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), providerRequestId: z.string().nullable(), correlationId: z.string().nullable(), model: z.string().nullable(), inputTokens: z.number().int().nullable(), outputTokens: z.number().int().nullable(), cachedInputTokens: z.number().int().nullable(), durationMs: z.number().int().nullable(), captureLevel: z.enum(['status', 'header', 'all']), startedAt: z.string(), completedAt: z.string().nullable(), expiresAt: z.string(), target: z.string().nullable(), requestHeaders: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).nullable(), responseHeaders: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).nullable(), requestBody: z.object({ encoding: z.enum(['utf8', 'base64']), contentType: z.string().nullable(), contentEncoding: z.string().nullable(), byteLength: z.number().int(), data: z.string() }).nullable(), responseBody: z.object({ encoding: z.enum(['utf8', 'base64']), contentType: z.string().nullable(), contentEncoding: z.string().nullable(), byteLength: z.number().int(), data: z.string() }).nullable(), errorDetail: z.record(z.unknown()).nullable() }).describe('Complete captured outbound request. Sensitive fields are present only at the selected capture level.');

export const StorageBackendView = z
  .object({
    id: z.string().describe('Storage backend identifier.'),
    type: z.enum(['database', 'local', 's3', 'git']).describe('Backend implementation type.'),
    purpose: z
      .enum(['primary', 'git_export'])
      .describe('Role this backend plays: authoritative content store, or Git export target.'),
    isActive: z.boolean().describe('Whether this backend is the currently active one for its purpose.'),
    replicaState: z
      .enum(['disabled', 'backfilling', 'enabled', 'degraded', 'deleting'])
      .describe('Replication lifecycle state of this backend.'),
    isReadPreferred: z.boolean().describe('Whether reads are preferentially served from this backend.'),
    syncStartedAt: z.string().nullable().describe('Timestamp when the current sync started, or null if none is running.'),
    syncCompletedAt: z.string().nullable().describe('Timestamp when the last sync completed, or null if never completed.'),
    lastSyncAt: z.string().nullable().describe('Timestamp of the most recent successful sync, or null if never synced.'),
    lastError: z.string().nullable().describe('Most recent error message, or null if none.'),
    config: z.record(z.unknown()).describe('Non-secret backend configuration.'),
    hasSecret: z.boolean().describe('Whether a secret (e.g. S3 key or Git token) is stored for this backend.'),
    createdAt: z.string().describe('Timestamp when the backend was created.'),
    updatedAt: z.string().describe('Timestamp when the backend was last updated.'),
  })
  .describe('Storage backend view, as returned to the admin UI. Never includes secrets.');

export const MigrationView = z
  .object({
    id: z.string().describe('Migration job identifier.'),
    status: z
      .enum(['pending', 'copying', 'verifying', 'completed', 'failed', 'aborted'])
      .describe('Current migration status.'),
    abortRequested: z.boolean().describe('Whether an abort has been requested for this migration.'),
    totalItems: z.number().int().nonnegative().describe('Total number of items to migrate.'),
    copiedItems: z.number().int().nonnegative().describe('Number of items copied so far.'),
    verifiedItems: z.number().int().nonnegative().describe('Number of items verified so far.'),
    errorMessage: z.string().nullable().describe('Error message, or null if none.'),
    startedAt: z.string().nullable().describe('Timestamp when the migration started, or null if not yet started.'),
    finishedAt: z.string().nullable().describe('Timestamp when the migration finished, or null if still running.'),
  })
  .describe('Content storage migration job status.');

export const StorageOverview = z
  .object({
    active: StorageBackendView.describe('Backend currently active for reads and writes.'),
    authoritative: StorageBackendView.describe('Backend that is the authoritative content store.'),
    preferredReadBackend: StorageBackendView.nullable().describe(
      'Backend preferentially used for reads, or null to use the authoritative backend.',
    ),
    backends: z.array(StorageBackendView).describe('All configured storage backends.'),
    gitExport: StorageBackendView.nullable().describe('Git export backend, or null if not configured.'),
    migration: MigrationView.nullable().describe('In-progress or most recent migration, or null if none.'),
    deployment: z
      .object({
        database: z.object({
          engine: z.literal('PostgreSQL').describe('Database engine.'),
          host: z.string().describe('Database host.'),
          port: z.string().describe('Database port.'),
          database: z.string().describe('Database name.'),
          username: z.string().describe('Database username.'),
          ssl: z.boolean().describe('Whether SSL is enabled for the database connection.'),
        }),
        local: z.object({
          containerPath: z.string().describe('Local storage path inside the container.'),
          hostPath: z.string().nullable().describe('Local storage path on the host, or null when unknown.'),
        }),
      })
      .describe('Deployment information for the database and local storage backends.'),
  })
  .describe('Storage overview, returned by GET /storage.');

export const StorageBackendUpsert = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('database').describe('Use the database as the storage backend.'),
      config: z.object({}).describe('Database backend has no additional configuration.'),
    }),
    z.object({
      type: z.literal('local').describe('Use the local filesystem as the storage backend.'),
      config: z
        .object({
          basePath: z.string().min(1).describe('Base directory path for stored content.'),
        })
        .describe('Local backend configuration.'),
    }),
    z.object({
      type: z.literal('s3').describe('Use S3-compatible object storage as the storage backend.'),
      config: z
        .object({
          endpoint: z.string().url().optional().describe('Custom S3-compatible endpoint URL, if not using AWS.'),
          region: z.string().min(1).describe('S3 region.'),
          bucket: z.string().min(1).describe('S3 bucket name.'),
          prefix: z.string().optional().describe('Optional key prefix for stored objects.'),
          accessKeyId: z.string().min(1).describe('S3 access key ID.'),
        })
        .describe('S3 backend configuration. The secret access key is submitted separately via `secret`.'),
      secret: z.string().min(1).optional().describe('S3 secret access key. Write-only; never echoed back.'),
    }),
  ])
  .describe('Storage backend configuration write. The shape of `config` depends on `type`.');

export const BackendCheckInput = z
  .object({
    backendId: z.string().uuid().optional().describe('Identifier of a saved backend to check.'),
    type: z
      .enum(['database', 'local', 's3'])
      .optional()
      .describe('Backend type to check, when checking an ad-hoc configuration.'),
    config: z.record(z.unknown()).optional().describe('Ad-hoc backend configuration to check, when not checking a saved backend.'),
    secret: z.string().optional().describe('Secret for the ad-hoc configuration, if required.'),
  })
  .refine((value) => Boolean(value.backendId) || Boolean(value.type && value.config), {
    message: 'Provide either backendId or type with config',
  })
  .describe('Ephemeral storage backend connection check. Provide either a saved backendId or an ad-hoc type/config pair.');

export const BackendCheckResult = z
  .object({
    ok: z.boolean().describe('Whether the connection check succeeded.'),
    detail: z.string().optional().describe('Additional detail, typically present on failure.'),
  })
  .describe('Result of a storage backend connection check.');

export const MigrationStartInput = z
  .object({
    targetBackendId: z.string().uuid().describe('Identifier of the backend to migrate content into.'),
    confirmOverwrite: z.boolean().optional().describe('Must be true to proceed when the target backend already has content.'),
  })
  .describe('Start a content storage migration.');

export const MigrationList = z
  .object({
    items: z.array(MigrationView).describe('Migration jobs, most recent first.'),
  })
  .describe('List of content storage migration jobs.');

export const CleanupJobView = z
  .object({
    jobId: z.string().describe('Cleanup job identifier.'),
    backendId: z.string().describe('Identifier of the backend being cleaned up.'),
    status: z.enum(['pending', 'running', 'completed', 'failed']).describe('Current cleanup job status.'),
    totalItems: z.number().int().nonnegative().describe('Total number of items to delete.'),
    deletedItems: z.number().int().nonnegative().describe('Number of items deleted so far.'),
    errorMessage: z.string().nullable().describe('Error message, or null if none.'),
    startedAt: z.string().nullable().describe('Timestamp when the cleanup job started, or null if not yet started.'),
    finishedAt: z.string().nullable().describe('Timestamp when the cleanup job finished, or null if still running.'),
  })
  .describe('Storage backend cleanup job status.');

export const CleanupStartInput = z
  .object({
    backendId: z.string().uuid().describe('Identifier of the backend to delete migrated-away content from.'),
    confirm: z.literal(true).describe('Must be true to confirm the destructive cleanup.'),
  })
  .describe('Start a storage backend cleanup job.');

export const StorageBackendDisable = z
  .object({
    retainData: z.boolean().describe('Whether to keep existing content on the backend instead of deleting it.'),
  })
  .describe('Disable a storage backend.');

export const StorageBackendEnable = z
  .object({
    syncExisting: z.boolean().describe('Whether to backfill existing content onto the backend.'),
  })
  .describe('Enable a storage backend.');

export const StorageReadBackend = z
  .object({
    backendId: z.string().uuid().nullable().describe('Backend to prefer for reads, or null to use the authoritative backend.'),
  })
  .describe('Set the preferred read backend.');

export const ReplicaSyncStatus = z
  .object({
    backendId: z.string().uuid().describe('Storage backend identifier.'),
    backendType: z.enum(['database', 'local', 's3']).describe('Backend implementation type.'),
    state: z
      .enum(['disabled', 'backfilling', 'enabled', 'degraded', 'deleting'])
      .describe('Replication lifecycle state of this backend.'),
    totalItems: z.number().int().nonnegative().describe('Total number of items to replicate.'),
    completedItems: z.number().int().nonnegative().describe('Number of items replicated so far.'),
    failedItems: z.number().int().nonnegative().describe('Number of items that failed to replicate.'),
    lastError: z.string().nullable().describe('Most recent error message, or null if none.'),
  })
  .describe('Storage backend replication sync progress.');

export const GitExportUpsert = z
  .object({
    enabled: z.boolean().describe('Whether Git export is enabled.'),
    config: z
      .object({
        remoteUrl: z.string().min(1).describe('Git remote URL (HTTPS or SSH, without embedded credentials).'),
        branch: z.string().min(1).describe('Git branch to push exports to.'),
        assetsDir: z.string().min(1).describe('Relative directory for exported assets.'),
        username: z.string().optional().describe('Username for HTTPS token authentication.'),
        authMode: z.enum(['https_token', 'ssh']).describe('Git authentication mode.'),
        publicKey: z.string().optional().describe('SSH public key, when using SSH authentication.'),
        fingerprint: z.string().optional().describe('SSH key fingerprint, when using SSH authentication.'),
        autoSyncOnPublish: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to export automatically when a page is published. Defaults to true.'),
        scheduledSyncEnabled: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to export on a schedule. Defaults to false.'),
        scheduledSyncIntervalMinutes: z
          .number()
          .int()
          .min(5)
          .max(1440)
          .optional()
          .default(60)
          .describe('Interval in minutes between scheduled exports (5-1440). Defaults to 60.'),
      })
      .describe('Git export backend configuration.'),
    secret: z.string().min(1).optional().describe('Git HTTPS access token. Write-only; never echoed back.'),
  })
  .describe('Create or update the Git export backend configuration.');

export const GitSshKeyResult = z
  .object({
    publicKey: z.string().describe('Generated SSH public key.'),
    fingerprint: z.string().describe('SSH key fingerprint.'),
  })
  .describe('Generated Git export SSH key pair (public half).');

export const GitExportRunResult = z
  .object({
    queued: z.boolean().describe('Whether a Git export run was queued.'),
  })
  .describe('Result of manually triggering a Git export run.');

export const TransferSourceView = z
  .object({
    id: z.string().uuid().describe('Transfer source identifier.'),
    type: z.enum(['wikijs']).describe('Transfer source system type.'),
    name: z.string().describe('Human-readable name for the source.'),
    baseUrl: z.string().describe('Base URL of the source instance.'),
    allowPrivateNetwork: z
      .boolean()
      .describe('Whether connecting to a private/internal network address is allowed.'),
    hasCredentials: z.boolean().describe('Whether an API token is stored for this source.'),
    status: z
      .enum(['unverified', 'healthy', 'unavailable', 'disabled'])
      .describe('Current reachability status of the source.'),
    lastCheckedAt: z.string().nullable().describe('Timestamp of the last connectivity check, or null if never checked.'),
    lastErrorCode: z.string().nullable().describe('Error code from the last failed check, or null if none.'),
    createdAt: z.string().describe('Timestamp when the source was created.'),
    updatedAt: z.string().describe('Timestamp when the source was last updated.'),
  })
  .describe('A configured Wiki.js transfer source.');

export const TransferSourceList = z
  .object({
    items: z.array(TransferSourceView).describe('Configured transfer sources.'),
  })
  .describe('List of configured Wiki.js transfer sources.');

export const TransferArtifactView = z
  .object({
    id: z.string().uuid().describe('Transfer artifact identifier.'),
    kind: z.enum(['source_archive', 'export_archive', 'run_report']).describe('Kind of artifact.'),
    status: z
      .enum(['uploading', 'ready', 'expired', 'deleted', 'failed'])
      .describe('Current artifact lifecycle status.'),
    runId: z.string().uuid().nullable().describe('Transfer run that produced this artifact, or null if not run-generated.'),
    originalFilename: z.string().nullable().describe('Original uploaded filename, or null if unknown.'),
    contentType: z.string().describe('MIME type of the artifact content.'),
    sizeBytes: z.number().int().nonnegative().describe('Size of the artifact in bytes.'),
    contentHash: z.string().nullable().describe('Content hash, or null until the upload completes.'),
    contentUrl: z.string().nullable().describe('URL to fetch the artifact content, or null when not downloadable.'),
    expiresAt: z.string().describe('Timestamp when the artifact expires and becomes eligible for cleanup.'),
    createdAt: z.string().describe('Timestamp when the artifact was created.'),
    readyAt: z.string().nullable().describe('Timestamp when the artifact became ready, or null if not yet ready.'),
    deletedAt: z.string().nullable().describe('Timestamp when the artifact was deleted, or null if not deleted.'),
  })
  .describe('A transfer artifact (uploaded archive or generated report).');

export const TransferRunView = z
  .object({
    id: z.string().uuid().describe('Transfer run identifier.'),
    kind: z
      .enum([
        'site_export',
        'archive_preview',
        'archive_import',
        'wikijs_source_test',
        'wikijs_preview',
        'wikijs_import',
      ])
      .describe('Kind of transfer run.'),
    status: z
      .enum(['queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled'])
      .describe('Current run status.'),
    phase: z
      .enum([
        'queued',
        'discovering',
        'validating',
        'planning',
        'downloading',
        'writing_assets',
        'writing_pages',
        'finalizing',
        'completed',
      ])
      .describe('Current processing phase.'),
    actorUserId: z.string().uuid().nullable().describe('User who started the run, or null if system-initiated.'),
    sourceId: z.string().uuid().nullable().describe('Transfer source this run reads from, or null if not source-based.'),
    sourceArtifactId: z
      .string()
      .uuid()
      .nullable()
      .describe('Source archive artifact this run reads from, or null if not archive-based.'),
    previewRunId: z
      .string()
      .uuid()
      .nullable()
      .describe('Preview run this run was confirmed from, or null if not a confirmation run.'),
    options: z.record(z.unknown()).describe('Transfer options used for this run.'),
    sourceFingerprint: z
      .string()
      .nullable()
      .describe('Fingerprint identifying the source content snapshot, or null if not applicable.'),
    totalItems: z.number().int().nonnegative().describe('Total number of items to process.'),
    processedItems: z.number().int().nonnegative().describe('Number of items processed so far.'),
    createdItems: z.number().int().nonnegative().describe('Number of items created.'),
    replacedItems: z.number().int().nonnegative().describe('Number of items replaced.'),
    skippedItems: z.number().int().nonnegative().describe('Number of items skipped.'),
    convertedItems: z.number().int().nonnegative().describe('Number of items converted.'),
    warningItems: z.number().int().nonnegative().describe('Number of items completed with warnings.'),
    failedItems: z.number().int().nonnegative().describe('Number of items that failed.'),
    currentItem: z.string().nullable().describe('Key of the item currently being processed, or null if idle.'),
    cancelRequested: z.boolean().describe('Whether a cancellation has been requested for this run.'),
    pauseRequested: z.boolean().describe('Whether a pause has been requested for this run.'),
    errorCode: z.string().nullable().describe('Run-level error code, or null if none.'),
    errorMessage: z.string().nullable().describe('Run-level error message, or null if none.'),
    errorDetail: z.string().nullable().describe('Additional run-level error detail, or null if none.'),
    reportArtifactId: z.string().uuid().nullable().describe('Generated report artifact, or null if not yet available.'),
    cleanedAt: z.string().nullable().describe('Timestamp when the imported pages were cleaned up, or null if never.'),
    queuedAt: z.string().describe('Timestamp when the run was queued.'),
    startedAt: z.string().nullable().describe('Timestamp when the run started, or null if not yet started.'),
    finishedAt: z.string().nullable().describe('Timestamp when the run finished, or null if still in progress.'),
    expiresAt: z.string().describe('Timestamp when the run record expires.'),
    canCancel: z.boolean().describe('Whether the caller can currently cancel this run.'),
    canRetry: z.boolean().describe('Whether the caller can currently retry this run.'),
    canPause: z.boolean().describe('Whether the caller can currently pause this run.'),
    canResume: z.boolean().describe('Whether the caller can currently resume this run.'),
    canCleanup: z.boolean().describe('Whether the caller can currently delete the pages this run imported.'),
  })
  .describe('A content transfer run.');

export const TransferRunList = z
  .object({
    items: z.array(TransferRunView).describe('Transfer runs for the current result window.'),
    total: z.number().int().nonnegative().describe('Total number of matching transfer runs.'),
  })
  .describe('Paginated list of content transfer runs.');

export const TransferRunAccepted = z
  .object({
    id: z.string().uuid().describe('Identifier of the queued transfer run.'),
    status: z.literal('queued').describe('The run has been queued for processing.'),
  })
  .describe('Response returned when a transfer run is accepted for asynchronous processing.');

export const TransferCleanupResult = z
  .object({
    id: z.string().uuid().describe('Identifier of the cleaned-up transfer run.'),
    deletedPages: z.number().int().nonnegative().describe('Number of imported pages that were deleted.'),
  })
  .describe('Result of deleting the pages a transfer run imported.');

export const TransferItemView = z
  .object({
    id: z.string().uuid().describe('Transfer item identifier.'),
    runId: z.string().uuid().describe('Transfer run this item belongs to.'),
    kind: z.enum(['page', 'asset', 'archive_entry']).describe('Kind of item.'),
    sourceKey: z.string().describe('Key identifying this item in the source.'),
    displayName: z.string().describe('Human-readable name for the item.'),
    targetKey: z.string().nullable().describe('Key identifying this item in the target, or null if not yet written.'),
    action: z.enum(['create', 'replace', 'skip', 'convert', 'validate']).describe('Action taken for this item.'),
    status: z
      .enum(['pending', 'running', 'completed', 'warning', 'failed', 'cancelled'])
      .describe('Current item status.'),
    bytesTotal: z.number().int().nonnegative().nullable().describe('Total size in bytes, or null if unknown.'),
    bytesProcessed: z.number().int().nonnegative().describe('Number of bytes processed so far.'),
    warningCode: z.string().nullable().describe('Warning code, or null if none.'),
    warningMessage: z.string().nullable().describe('Warning message, or null if none.'),
    errorCode: z.string().nullable().describe('Error code, or null if none.'),
    errorMessage: z.string().nullable().describe('Error message, or null if none.'),
    metadata: z.record(z.unknown()).describe('Additional item metadata.'),
    attempts: z.number().int().nonnegative().describe('Number of processing attempts.'),
    startedAt: z.string().nullable().describe('Timestamp when processing started, or null if not yet started.'),
    finishedAt: z.string().nullable().describe('Timestamp when processing finished, or null if still in progress.'),
  })
  .describe('Outcome of a single item processed within a transfer run.');

export const TransferItemList = z
  .object({
    items: z.array(TransferItemView).describe('Transfer items for the current result window.'),
    total: z.number().int().nonnegative().describe('Total number of matching transfer items.'),
  })
  .describe('Paginated list of content transfer item outcomes.');

export const okResponseSchema = z.object({ ok: z.boolean() }).describe('Simple OK response');

export const previewInputSchema = z
  .object({ contentSource: z.string() })
  .describe('Markdown preview input');

export const previewOutputSchema = z
  .object({ html: z.string() })
  .describe('Rendered HTML output');

export const registerOutputSchema = z
  .object({
    userId: z.string(),
    migratedActionCount: z.number().int().nonnegative().describe('Anonymous Wiki AI actions claimed by this registration.'),
  })
  .describe('Registration response');

export const changeEmailOutputSchema = z
  .object({ id: z.string(), email: z.string() })
  .describe('Changed email response');

export const profileViewSchema = z
  .object({ id: z.string(), email: z.string(), displayName: z.string().nullable() })
  .describe('Profile view');

export const userIdParamSchema = z.object({ id: z.string().uuid() }).describe('User ID path parameter');

export const errorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
  })
  .describe('API error response');

export const PublicPagePath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]([a-z0-9_/-]*[a-z0-9])?$/)
  .describe('Canonical wiki page path. Use lowercase slash-separated path segments; hyphens and underscores are allowed.');

export const PublicPageIdPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
  })
  .describe('Public page ID path parameters.');

export const PublicPageRevisionPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
    version: z.coerce.number().int().min(1).describe('Revision version number.'),
  })
  .describe('Public page revision path parameters.');

export const PublicAssetIdPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
  })
  .describe('Public asset ID path parameters.');

export const PublicSemanticSearchIdPathParams = z
  .object({
    id: z.string().uuid().describe('Stable semantic search action identifier.'),
  })
  .describe('Public semantic search action ID path parameters.');

export const PublicImageActionIdPathParams = z
  .object({
    actionId: z.string().uuid().describe('Stable private image generation action identifier.'),
  })
  .describe('Private image generation action path parameters.');

export const PublicGeneratedArtifactIdPathParams = z
  .object({
    artifactId: z.string().uuid().describe('Stable private generated image artifact identifier.'),
  })
  .describe('Private generated image artifact path parameters.');

export const PublicImageContentType = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const PublicAuthor = z
  .object({
    id: z.string().uuid().nullable().describe('Author user identifier, or null when the author is not disclosed.'),
    displayName: z.string().nullable().describe('Author display name, or null when not available.'),
  })
  .describe('Public author identity visible to the caller.');

export const PublicRevisionSummary = z
  .object({
    id: z.string().uuid().describe('Stable revision identifier.'),
    pageId: z.string().uuid().describe('Identifier of the page this revision belongs to.'),
    version: z.number().int().min(1).describe('Monotonically increasing revision version, starting at 1.'),
    status: z.enum(['draft', 'published']).describe('Revision lifecycle state: an unpublished draft or a published revision.'),
    contentType: z.string().describe('MIME type of the revision body (RFC 2046 type/subtype). Wiki/generated revisions are text/markdown; raw revisions carry the original source format.'),
    contentHash: z.string().describe('Content hash of the Markdown source, used for optimistic concurrency control.'),
    author: PublicAuthor,
    createdAt: z.string().datetime().describe('Timestamp when the revision was created (ISO 8601).'),
    publishedAt: z
      .string()
      .datetime()
      .nullable()
      .describe('Timestamp when the revision was published (ISO 8601), or null if still a draft.'),
    canPublish: z.boolean().describe('Whether the current caller is allowed to publish this revision.'),
    origin: z
      .object({
        actorKind: z.enum(['human', 'machine']).describe('Whether this revision was written through a session (human) or an API key/pipeline (machine).'),
        nature: z.enum(['original', 'generated']).describe('Creation-time classification of the page: original human input or generated content.'),
      })
      .optional()
      .describe('Provenance of this revision, projected when the caller may read it.'),
  })
  .describe('Public page revision metadata.');

export const PublicRevisionResource = PublicRevisionSummary.extend({
  contentSource: z
    .string()
    .optional()
    .describe('Markdown source of the revision. Present only on GET /pages/{id}/revisions/{version}; omitted from the revision list.'),
  origin: z
    .object({
      actorKind: z.enum(['human', 'machine']).describe('Whether this revision was written through a session (human) or an API key/pipeline (machine).'),
      nature: z.enum(['original', 'generated']).describe('Creation-time classification of the page: original human input or generated content.'),
    })
    .optional()
    .describe('Provenance of this revision.'),
  source: z
    .object({
      channel: z.string().optional().describe('Ingestion channel of a raw chunk.'),
      url: z.string().optional().describe('Source URL of a raw chunk.'),
      sessionId: z.string().optional().describe('Ingestion session identifier of a raw chunk.'),
      command: z.string().optional().describe('Ingestion command of a raw chunk.'),
      occurredAt: z.string().datetime().optional().describe('Timestamp when the raw chunk was captured (ISO 8601).'),
    })
    .nullable()
    .optional()
    .describe('Immutable raw-source metadata of a raw create/append chunk.'),
  originalAsset: z
    .object({
      id: z.string().uuid().describe('Content-asset id of the immutable original bytes.'),
      contentType: z.string().describe('MIME type of the original bytes.'),
      sizeBytes: z.number().int().nonnegative().describe('Size of the original bytes.'),
      contentHash: z.string().describe('sha256 of the original bytes.'),
    })
    .nullable()
    .optional()
    .describe('Dual-track raw storage reference to the immutable original bytes, or null when the body is already plain text.'),
  categoryId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe('Raw taxonomy category of the owning page (echoed here for convenience). Null for non-raw pages.'),
  frontmatter: z
    .record(z.unknown())
    .nullable()
    .describe('Parsed YAML frontmatter from the leading --- block of the Markdown source, or null if absent/malformed.'),
  metadata: z
    .object({
      date: z.string().nullable().describe('Calendar date from supported frontmatter, or null when absent.'),
      summary: z.string().nullable().describe('Author-written summary from supported frontmatter, or null when absent.'),
      tags: z.array(z.object({
        id: z.string().uuid(),
        name: z.string(),
        normalizedName: z.string(),
      })),
    })
    .optional()
    .describe('Typed page metadata projection for this immutable revision.'),
}).describe('Public page revision with Markdown source when the caller may read it.');

export const PublicPageIncludeValue = z
  .enum(['latestRevision', 'publishedRevision'])
  .describe('Optional page relation that can be requested via ?include=.');

export const PublicPageResource = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
    spaceSlug: z.string().describe('Slug of the wiki space the page belongs to.'),
    path: PublicPagePath,
    slug: z.string().describe("Canonical public address (035) — the effective slug this page resolves at. For a translation, this is its source page's slug."),
    locale: z.string().describe('Locale of the page content (e.g. "en", "zh").'),
    title: z.string().describe('Human-readable page title.'),
    canonicalUrl: z.string().optional().describe('Configured public reader URL for this page.'),
    origin: z
      .object({
        actorKind: z.enum(['human', 'machine']).describe('Whether the page was created through a session (human) or an API key/pipeline (machine).'),
        nature: z.enum(['original', 'generated']).describe('Creation-time classification: original human input or generated content.'),
    })
    .optional()
    .describe('Creation provenance of the page.'),
    humanModified: z
      .boolean()
      .optional()
      .describe('Whether any revision of the page was written by a human actor.'),
    visibility: z
      .enum(['public', 'registered', 'restricted'])
      .optional()
      .describe('Page visibility: public, registered-user-only, or restricted to administrators.'),
    rawCategorySystemKey: z
      .string()
      .nullable()
      .optional()
      .describe("Built-in raw category key (e.g. 'conversation') for a raw page filed under a system category; null/omitted otherwise."),
    conversationChannel: z
      .enum(['wiki-ai', 'feishu'])
      .nullable()
      .optional()
      .describe('Capture channel for a Conversation raw page (025); null/omitted for non-conversation pages and legacy captures that predate the field.'),
    contentSource: z
      .string()
      .optional()
      .describe('Markdown source of the current revision. Omitted from list/search results; present on single-page reads and writes.'),
    frontmatter: z
      .record(z.unknown())
      .nullable()
      .describe('Parsed YAML frontmatter from the leading --- block of the Markdown source, or null if absent/malformed.'),
    writeMetadataToFrontmatter: z
      .boolean()
      .optional()
      .describe('Per-page authoring preference: whether supported metadata is also embedded as a frontmatter block in the Markdown body.'),
    metadata: z
      .object({
        date: z.string().nullable().describe('Calendar date from supported frontmatter, or null when absent.'),
        summary: z.string().nullable().describe('Author-written summary from supported frontmatter, or null when absent.'),
        tags: z.array(z.object({
          id: z.string().uuid(),
          name: z.string(),
          normalizedName: z.string(),
        })),
      })
      .optional()
      .describe('Typed metadata for the revision currently visible to the caller.'),
    status: z
      .enum(['draft', 'published', 'deleted'])
      .describe('Page lifecycle state: an unpublished draft, a published page, or a soft-deleted page.'),
    author: PublicAuthor,
    latestRevision: PublicRevisionSummary
      .nullable()
      .optional()
      .describe('Most recent revision of any status, or null if none exists. Omitted unless requested via ?include=latestRevision.'),
    publishedRevision: PublicRevisionSummary
      .nullable()
      .optional()
      .describe('Most recent published revision, or null if never published. Omitted unless requested via ?include=publishedRevision.'),
    createdAt: z.string().datetime().describe('Timestamp when the page was created (ISO 8601).'),
    updatedAt: z.string().datetime().describe('Timestamp when the page was last updated (ISO 8601).'),
    links: z
      .object({
        self: z.string().describe('Canonical API URL of this page resource. Also the target for PATCH updates.'),
        byPath: z.string().describe('API URL to look up this page by its canonical path (GET /v1/pages?path=...).'),
        revisions: z.string().describe('API URL listing this page revisions.'),
        drafts: z.string().describe('API URL for creating draft revisions of this page.'),
      })
      .describe('Related API resource URLs for this page.'),
  })
  .describe('Public wiki page resource.');

export const PublicPageMetadataInput = z.object({
  baseRevisionId: z.string().uuid().describe('Latest revision id the patch was based on.'),
  title: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
}).describe('Additive patch for the supported page metadata fields.');

export const PublicPageTagsInput = z.object({
  tags: z.array(z.string().min(1).max(100)).max(50).describe('The complete replacement tag set for the page.'),
}).describe('Replace a page\'s tags; the change is published immediately.');

export const PublicTag = z.object({
  id: z.string().uuid(),
  name: z.string(),
  normalizedName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).describe('An active, reusable wiki tag.');

export const PublicTagListQuery = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  space: z.string().optional(),
}).describe('Tag-directory filter and pagination parameters.');

export const PublicTagCreateInput = z.object({
  name: z.string().min(1).max(100),
}).describe('Creates a reusable tag.');

export const PublicTagRenameInput = z.object({
  name: z.string().min(1).max(100),
}).describe('New name for a reusable tag.');

export const PublicTagMergeInput = z.object({
  targetTagId: z.string().uuid(),
}).describe('Existing destination tag that receives all assignments from the source tag.');

export const PublicTagMutation = z.object({
  id: z.string().uuid(),
  tagId: z.string().uuid(),
  targetTagId: z.string().uuid().nullable(),
  kind: z.enum(['rename', 'delete', 'merge']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  requestedName: z.string().nullable(),
  affectedPageCount: z.number().int().nullable(),
  failure: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
}).describe('Asynchronous tag rename, retirement, or merge operation.');

export const PublicTagIdPathParams = z.object({ id: z.string().uuid() });

/**
 * Named `...Params` (not `PublicPageListQuery`) deliberately: next-openapi-gen
 * fails to resolve a doc schema whose name exactly matches the
 * `PublicPageListQuery` type already exported from @next-wiki/shared and
 * packages/mcp-server (silently producing zero query parameters in the
 * generated OpenAPI doc, with no diagnostic) — confirmed by renaming this
 * schema alone, with byte-identical content, fixing the resolution. Other
 * `Public*Query` doc schemas below happen not to collide the same way; if a
 * future one does, this is the fix.
 */
export const PublicPageListQueryParams = z
  .object({
    status: z
      .enum(['published', 'draft', 'all', 'deleted'])
      .optional()
      .default('published')
      .describe('Filter pages by lifecycle state. Defaults to published.'),
    q: z.string().min(1).max(200).optional().describe('Optional free-text query to filter pages by path or title.'),
    path: PublicPagePath.optional().describe(
      'Exact canonical path to look up a single page. When provided, returns at most one matching page and ignores other filters.',
    ),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to list all pages under a subtree (e.g. "docs" matches "docs/a", "docs/b", "docs"). Cannot be combined with path.',
    ),
    space: z
      .string()
      .optional()
      .describe('Space slug to list pages from. Defaults to the default wiki space.'),
    filterType: z
      .string()
      .optional()
      .describe('SDK-friendly alias for filter[type]. Filters to pages whose frontmatter type matches this value.'),
    'filter[type]': z
      .string()
      .optional()
      .describe('Filter to pages whose frontmatter type matches this value.'),
    filterInputKind: z
      .enum(['chat-transcript', 'external-fetch', 'script-run', 'manual-note'])
      .optional()
      .describe('Raw-only: filter raw entries by their captured inputKind. Independent from filterType (the OKF/frontmatter type).'),
    filterCategoryId: z
      .string()
      .uuid()
      .optional()
      .describe('Raw-only: filter raw entries by their raw_categories taxonomy id. Independent from filterType.'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of pages to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
    order: z
      .enum(['path', 'recent', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc'])
      .optional()
      .default('path')
      .describe('Sort order. Use createdAtDesc for newest pages first. Defaults to path.'),
    include: z
      .string()
      .optional()
      .describe(
        'Comma-separated relations to include: latestRevision, publishedRevision. Omitted by default; fetch a specific revision via GET /pages/{id}/revisions/{version} instead.',
      ),
    createdStart: z.coerce
      .date()
      .optional()
      .describe('Include only pages created at or after this ISO 8601 timestamp.'),
    createdEnd: z.coerce
      .date()
      .optional()
      .describe('Include only pages created at or before this ISO 8601 timestamp.'),
    'filter[tag]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose structured tags include any of these values (repeat the param for multiple, OR-combined).'),
    'filter[status]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose frontmatter status matches any of these values (repeat the param for multiple, OR-combined).'),
    'filter[owner]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose frontmatter owner matches any of these values (repeat the param for multiple, OR-combined).'),
    'filter[has_frontmatter]': z
      .enum(['true', 'false'])
      .optional()
      .describe('Filter to pages with (true) or without (false) any parsed frontmatter.'),
  })
  .describe('Public page list query parameters.');

export const PublicPageIncludeQuery = z
  .object({
    include: z
      .string()
      .optional()
      .describe('Comma-separated relations to include in the returned page resource: latestRevision, publishedRevision.'),
  })
  .describe('Optional ?include= query parameter for endpoints returning a single PublicPageResource.');

export const PublicPageListResponse = z
  .object({
    items: z.array(PublicPageResource).describe('Page resources for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public page list.');

export const PublicPageCreateInput = z
  .object({
    path: PublicPagePath,
    slug: PublicPagePath.optional().describe(
      'Canonical public address. Defaults to path when omitted (FR-004) — distinct from path, which is only the tree location.',
    ),
    locale: z.string().min(1).max(20).optional().describe('Locale of the page content (e.g. "en"). Defaults to the workspace default.'),
    title: z.string().min(1).max(200).describe('Human-readable page title.'),
    contentSource: z.string().optional().default('').describe('Markdown source of the initial page revision. Optional; defaults to an empty draft.'),
    space: z.string().min(1).max(100).optional().describe('Target space slug. Raw entries require "raw" and an inputKind.'),
    nature: z.enum(['original', 'generated']).optional().describe('Explicit creation-time classification; defaults from the actor (human=original, machine=generated).'),
    inputKind: z.enum(['chat-transcript', 'external-fetch', 'script-run', 'manual-note']).optional().describe('Required for raw entries; stored as the OKF frontmatter type.'),
    source: z.object({
      channel: z.string().min(1).max(200).optional(),
      url: z.string().url().optional(),
      sourceId: z.string().uuid().optional(),
      title: z.string().min(1).max(500).optional(),
      provider: z.string().min(1).max(100).optional(),
      contentHash: z.string().min(16).max(256).optional(),
      retrievedAt: z.string().datetime().optional(),
      sessionId: z.string().min(1).max(200).optional(),
      command: z.string().min(1).max(10_000).optional(),
      occurredAt: z.string().datetime().optional(),
    }).optional().describe('Immutable source metadata for a raw entry.'),
    contentType: z.string().optional().describe('MIME type of a raw entry body (RFC 2046). Required when the body is not markdown; defaults to text/markdown.'),
    originalBytes: z.string().optional().describe('Optional base64 raw payload (PDF, HTML, JSON, image, log) stored via content_assets; its sha256 is recorded on the revision.'),
    categoryId: z.string().uuid().optional().describe('Raw taxonomy category id. Required when space=raw unless an admin default is configured; immutable after creation.'),
  })
  .describe('Create a public wiki page.');

export const PublicRawAppendInput = z
  .object({
    content: z.string().min(1).max(1_000_000).describe('Markdown chunk appended to a raw entry.'),
    source: z.object({
      channel: z.string().min(1).max(200).optional(),
      url: z.string().url().optional(),
      sourceId: z.string().uuid().optional(),
      title: z.string().min(1).max(500).optional(),
      provider: z.string().min(1).max(100).optional(),
      contentHash: z.string().min(16).max(256).optional(),
      retrievedAt: z.string().datetime().optional(),
      sessionId: z.string().min(1).max(200).optional(),
      command: z.string().min(1).max(10_000).optional(),
      occurredAt: z.string().datetime().optional(),
    }).optional().describe('Immutable source metadata for this appended chunk.'),
    contentType: z.string().optional().describe('MIME type of the appended chunk body (RFC 2046). Defaults to text/markdown.'),
    originalBytes: z.string().optional().describe('Optional base64 original payload for this chunk, stored via content_assets.'),
  })
  .describe('Append an immutable chunk to a raw entry.');

export const PublicRawCategory = z
  .object({
    id: z.string().uuid().describe('Stable category identifier; use as categoryId when creating raw entries.'),
    name: z.string().describe('Human-readable category name.'),
    slug: z.string().describe('URL-safe category slug.'),
    description: z.string().nullable().describe('Optional description, or null.'),
    isDefault: z.boolean().describe('Whether this category is applied when a raw create omits categoryId.'),
    isRetired: z.boolean().describe('Retired categories keep existing entries but accept no new ones.'),
    systemKey: z.string().nullable().describe("Stable built-in category key (e.g. 'conversation'), or null for an admin-managed category."),
    isSystem: z.boolean().describe('Whether this category is built-in and protected from retirement/deletion.'),
    entryCount: z.number().int().nonnegative().describe('Number of raw entries currently filed under this category.'),
    createdAt: z.string().datetime().describe('Timestamp when the category was created (ISO 8601).'),
    updatedAt: z.string().datetime().describe('Timestamp when the category was last updated (ISO 8601).'),
  })
  .describe('A raw taxonomy category.');

export const PublicRawCategoryListResponse = z
  .object({ items: z.array(PublicRawCategory).describe('All raw taxonomy categories.') })
  .describe('Raw taxonomy listing.');

export const PublicRawCategoryCreateInput = z
  .object({
    name: z.string().min(1).max(100).describe('Human-readable category name.'),
    slug: z.string().min(1).max(100).describe('URL-safe slug (lowercase letters, numbers, hyphens).'),
    description: z.string().max(2000).nullish().describe('Optional description.'),
    isDefault: z.boolean().optional().describe('Apply as the default category for raw creates that omit categoryId.'),
  })
  .describe('Create a raw taxonomy category.');

export const ContentDataSourceItem = z
  .object({
    sourceKey: z.enum(['ai-conversations']).describe('Stable registered Content Data Source key.'),
    category: z.literal('content').describe('Data source category grouping.'),
    label: z.string().describe('Human-readable label.'),
    description: z.string().describe('Human-readable description.'),
    enabled: z.boolean().describe('Whether the source currently captures content.'),
    available: z.boolean().describe('Whether the source can operate in the current writing mode.'),
    unavailableReason: z.string().nullable().describe('Reason the source is unavailable, or null when available.'),
    updatedAt: z.string().datetime().describe('Timestamp when the source setting was last updated (ISO 8601).'),
  })
  .describe('A registered Content > Data Source and its current settings.');

export const ContentDataSourceListResponse = z
  .object({ items: z.array(ContentDataSourceItem).describe('All registered content data sources.') })
  .describe('Content Data Sources listing.');

export const ContentDataSourceUpdateInput = z
  .object({ enabled: z.boolean().describe('Whether the source should capture content going forward.') })
  .describe('Update a Content Data Source.');

export const PublicDraftCreateInput = z
  .object({
    title: z.string().min(1).max(200).describe('Human-readable title for the draft revision.'),
    contentSource: z.string().min(1).describe('Markdown source of the draft revision.'),
    baseRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Revision the draft is based on, for conflict detection. Omit to base on the latest revision.'),
    baseContentHash: z
      .string()
      .optional()
      .describe('Expected content hash of the base revision, used for optimistic concurrency control.'),
    metadata: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      tags: z.array(z.string().min(1).max(100)).max(50),
      summary: z.string().max(2000).nullable(),
    }).optional().describe('Optional structured metadata override. When present, metadata is stored on the revision without requiring equivalent Markdown frontmatter.'),
    writeMetadataToFrontmatter: z
      .boolean()
      .optional()
      .describe('Per-page preference: whether supported metadata is also embedded as a frontmatter block. Omitted by API/AI writers, in which case it is derived from the submitted content.'),
  })
  .describe('Create a draft revision for an existing public page.');

export const PublicPagePropertiesInput = z
  .object({
    path: PublicPagePath.optional(),
    title: z.string().min(1).max(200).optional().describe('New page title.'),
    slug: PublicPagePath.optional().describe(
      'New canonical public address. Distinct from `path`: changing it never moves the page in the tree, only where it is publicly reachable. A published page\'s former address is retained as a redirect.',
    ),
    baseRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Expected current revision id, used for optimistic concurrency control.'),
  })
  .describe('Update page properties. Provide at least one of path, title, or slug.');

export const PublicPageAddress = z
  .object({
    id: z.string().uuid(),
    address: PublicPagePath,
    kind: z.enum(['retained', 'manual']).describe('retained: kept automatically from a previous slug or translation locale. manual: added explicitly by an owner.'),
    reason: z.string().nullable().describe('Why a retained alias exists, e.g. "slug_change". Null for a manual alias.'),
    createdAt: z.string().datetime(),
  })
  .describe('One non-canonical public address of a page.');

export const PublicPageAddressList = z
  .object({
    canonical: z.object({ address: PublicPagePath, url: z.string() }).describe("The page's current canonical address."),
    aliases: z.array(PublicPageAddress),
  })
  .describe("A page's canonical address plus every retained and manually added alias.");

export const PublicPageAddressCreateInput = z
  .object({ address: PublicPagePath.describe('The alias address to add. Always created as kind=manual.') })
  .describe('Add a manually added alias address to a page.');

export const PageAddressReleaseQuery = z
  .object({ release: z.enum(['true']).optional().describe('Must be exactly "true" to release a soft-deleted page\'s addresses.') })
  .describe('Query parameters for releasing a deleted page\'s addresses.');

export const PageAddressReleaseResult = z
  .object({ released: z.number().int().nonnegative().describe('Count of addresses freed, including the canonical slug.') })
  .describe('Result of releasing a deleted page\'s addresses.');

export const PageAddressDeleteQuery = z
  .object({
    confirmBreakingPublicLinks: z.enum(['true']).optional().describe('Required (must be exactly "true") to remove a retained alias; omit for a manual alias.'),
  })
  .describe('Query parameters for removing a page address.');

export const PageAddressRemoveResult = z
  .object({ address: PublicPagePath, kind: z.enum(['retained', 'manual']) })
  .describe('The address that was removed.');

export const PublicRevisionListQuery = z
  .object({
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .describe('Filter revisions by lifecycle state. Defaults to all.'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of revisions to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
  })
  .describe('Public revision list query parameters.');

export const PublicRevisionListResponse = z
  .object({
    items: z.array(PublicRevisionResource).describe('Revision resources for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public revision list.');

export const PublicPublicationInput = z
  .object({
    expectedRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Revision id the caller expects to publish, used for optimistic concurrency control.'),
  })
  .describe('Publish revision input.');

export const PublicPageRenderingResult = z
  .object({
    pageId: z.string().uuid().describe('Stable public page identifier.'),
    revisionsRendered: z
      .number()
      .int()
      .min(0)
      .describe('Number of live revisions (published and latest draft) passed through the render pipeline.'),
    revisionsChanged: z
      .number()
      .int()
      .min(0)
      .describe('Number of those revisions whose stored HTML actually changed.'),
  })
  .describe('Page re-render result.');

// Named `PublicPageSearchQueryParams` (not `PublicPageSearchQuery`) deliberately:
// next-openapi-gen silently drops this route's query parameters when the
// @queryParams schema name collides with a same-named type exported elsewhere in
// the workspace — here the `PublicPageSearchQuery` type in @next-wiki/shared and
// packages/mcp-server. This is the same collision, and the same fix, documented
// for `PublicPageListQueryParams` above.
export const PublicPageSearchQueryParams = z
  .object({
    q: z.string().min(1).max(200).describe('Free-text search query.'),
    scope: z
      .enum(['path', 'title', 'content', 'all'])
      .optional()
      .default('all')
      .describe('Restrict matching to a field, or search across all fields. Defaults to all.'),
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .default('published')
      .describe('Filter results by page lifecycle state. Defaults to published.'),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to restrict matching to pages under a subtree (e.g. "docs" matches "docs/a", "docs/b").',
    ),
    space: z
      .string()
      .optional()
      .describe('Space slug to search within. Defaults to the default wiki space.'),
    'filter[type]': z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Filter to pages whose frontmatter type matches this value.'),
    filterType: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('SDK-friendly alias for filter[type].'),
    filterInputKind: z
      .enum(['chat-transcript', 'external-fetch', 'script-run', 'manual-note'])
      .optional()
      .describe('Raw-only: filter raw entries by inputKind, independent from filterType.'),
    filterCategoryId: z
      .string()
      .uuid()
      .optional()
      .describe('Raw-only: filter raw entries by raw_categories taxonomy id, independent from filterType.'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of results to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated relations to include on each result page: latestRevision, publishedRevision.'),
    excerptLength: z.coerce
      .number()
      .int()
      .min(20)
      .max(500)
      .optional()
      .default(100)
      .describe('Approximate number of characters of context to return around the matched keyword in excerpt (20-500). Defaults to 100.'),
    createdStart: z.coerce.date().optional().describe('Only include pages created at or after this ISO 8601 timestamp.'),
    createdEnd: z.coerce.date().optional().describe('Only include pages created at or before this ISO 8601 timestamp.'),
    updatedStart: z.coerce.date().optional().describe('Only include pages last updated at or after this ISO 8601 timestamp.'),
    updatedEnd: z.coerce.date().optional().describe('Only include pages last updated at or before this ISO 8601 timestamp.'),
    order: z
      .enum(['relevance', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc'])
      .optional()
      .default('relevance')
      .describe('Sort order. Use createdAtDesc for newest pages first; relevance is the default.'),
    'filter[tag]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose structured tags include any of these values (repeat the param for multiple, OR-combined).'),
    'filter[status]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose frontmatter status matches any of these values (repeat the param for multiple, OR-combined).'),
    'filter[owner]': z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Filter to pages whose frontmatter owner matches any of these values (repeat the param for multiple, OR-combined).'),
    'filter[has_frontmatter]': z
      .enum(['true', 'false'])
      .optional()
      .describe('Filter to pages with (true) or without (false) any parsed frontmatter.'),
  })
  .describe('Public page search query parameters.');

export const PublicSearchResult = z
  .object({
    page: PublicPageResource,
    matchType: z.enum(['path', 'title', 'content']).describe('Which field produced the match for this result.'),
    excerpt: z
      .string()
      .nullable()
      .describe(
        'Snippet of contentSource centered on the matched keyword (~excerptLength characters), or null for path/title matches or when not applicable. The result page never includes the full contentSource.',
      ),
    score: z
      .number()
      .nullable()
      .describe(
        'Relevance score in (0, 1]. Path matches score highest, then title, then content (weighted by how many times the term appears). Results are sorted by score descending within each returned page; null is not currently produced.',
      ),
  })
  .describe('Public page search result.');

export const PublicPageSearchResponse = z
  .object({
    items: z.array(PublicSearchResult).describe('Search results for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public page search response.');

export const HybridSearchQueryInput = z
  .object({
    kind: z.literal('query').describe('Selects the idempotent query operation.'),
    searchRecordId: z.string().uuid().describe('Client-generated idempotency key for one search attempt; retries reuse it.'),
    searchSessionId: z.string().uuid().describe('Client-generated overlay session identifier owning this attempt.'),
    q: z.string().trim().min(2).max(200).describe('Free-text search query (minimum two characters).'),
    limit: z.number().int().min(1).max(20).optional().default(20).describe('Maximum number of fused results to return (1-20). Defaults to 20.'),
    space: z.string().optional().describe('Space slug to search within. Defaults to the default wiki space.'),
  })
  .describe('Run or resume one idempotent Header hybrid search attempt.');

export const HybridSearchBehaviorInput = z
  .object({
    kind: z.literal('behavior').describe('Selects the behavior-recording operation.'),
    eventId: z.string().uuid().describe('Client-generated idempotency key for this behavior event.'),
    searchRecordId: z.string().uuid().describe('Search attempt the behavior belongs to.'),
    searchSessionId: z.string().uuid().describe('Overlay session that owns the search attempt.'),
    action: z.enum(['result_open', 'escape']).describe('Terminal search behavior: a result was opened, or search was abandoned.'),
    pageId: z.string().uuid().optional().describe('Opened page id; required for result_open and forbidden for escape.'),
  })
  .describe('Record a terminal search behavior for an owned search attempt.');

export const HybridPageSearchInput = z
  .discriminatedUnion('kind', [HybridSearchQueryInput, HybridSearchBehaviorInput])
  .describe('Header hybrid search request: an idempotent query snapshot or a behavior event.');

export const HybridSearchEngineState = z
  .object({
    capability: z
      .enum(['full_text', 'fuzzy', 'semantic'])
      .describe('Stable product capability identifier; never a database extension or vendor name.'),
    state: z
      .enum(['ready', 'pending', 'skipped', 'unavailable', 'failed', 'timed_out'])
      .describe('Safe lifecycle state for this capability within the attempt. No diagnostic detail is exposed.'),
    resultCount: z.number().int().min(0).describe('Readable result count contributed by this capability after permission filtering.'),
  })
  .describe('Per-capability lifecycle state for one search attempt.');

export const HybridSearchResult = z
  .object({
    page: PublicPageResource,
    excerpt: z.string().nullable().describe('Safe excerpt centered on matched content, or null when excerpts are disabled or absent.'),
    score: z.number().describe('Fused rank score. Not comparable to legacy GET search scores.'),
    relevanceScore: z.number().min(-1).max(1).describe('Compatibility display value; not the cross-engine ordering algorithm.'),
    matchSources: z
      .array(z.enum(['keyword', 'semantic']))
      .min(1)
      .describe('Conceptual feature-013 match sources retained for existing clients.'),
    engineSources: z
      .array(z.enum(['full_text', 'fuzzy', 'semantic']))
      .min(1)
      .optional()
      .describe('Stable capability provenance. Absent only for old stored/compatibility responses.'),
  })
  .describe('One de-duplicated, permission-filtered hybrid search result.');

export const HybridPageSearchResponse = z
  .object({
    searchRecordId: z.string().uuid().describe('Idempotency key of the search attempt this snapshot belongs to.'),
    semanticState: z
      .enum(['pending', 'ready', 'unavailable', 'failed', 'skipped'])
      .describe('Feature-013 compatibility mirror of the semantic capability; semantic timed_out maps to failed.'),
    engineStates: z
      .array(HybridSearchEngineState)
      .optional()
      .describe('Every capability in the attempt snapshot with its safe lifecycle state. Poll while any state is pending.'),
    items: z.array(HybridSearchResult).describe('Latest fused snapshot of readable results, de-duplicated by page id.'),
  })
  .describe('Progressive Header hybrid search snapshot. Every response is a full latest snapshot, not a delta.');

export const PublicSemanticSearchSubmitInput = z
  .object({
    q: z.string().trim().min(1).max(8_000).describe('Free-text semantic search query.'),
    limit: z.number().int().min(1).max(50).optional().default(10).describe('Maximum number of results to return (1-50). Defaults to 10.'),
    pathPrefix: z.string().optional().describe('Directory prefix to restrict matching to pages under a subtree.'),
    space: z.string().optional().describe('Restrict to one space the caller can read. Omit for the union of readable spaces (raw/generated only for Admins).'),
    scope: z
      .enum(['path', 'title', 'content', 'all'])
      .optional()
      .default('all')
      .describe('Accepted for request-shape parity with the keyword endpoint; has no effect on semantic (vector) matching.'),
    filterTag: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Restrict results to pages whose frontmatter tags include any of these values.'),
    filterStatus: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Restrict results to pages whose frontmatter status matches any of these values.'),
    filterOwner: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Restrict results to pages whose frontmatter owner matches any of these values.'),
    filterHasFrontmatter: z.boolean().optional().describe('Restrict results to pages with (true) or without (false) any parsed frontmatter.'),
  })
  .describe('Submit a semantic wiki search.');

export const PublicSemanticSearchCitation = z
  .object({
    chunkId: z.string().uuid().describe('Identifier of the matched knowledge chunk.'),
    revisionId: z.string().uuid().describe('Identifier of the page revision the chunk was extracted from.'),
    contentHash: z.string().describe('Content hash of the source revision, for grounding verification.'),
  })
  .describe('Grounded citation for a semantic search result item.');

export const PublicSemanticSearchResultItem = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the matched page.'),
    path: PublicPagePath,
    title: z.string().describe('Title of the matched page.'),
    score: z.number().min(-1).max(1).describe('Cosine similarity score for the best-matching chunk on this page.'),
    excerpt: z.string().describe('Combined excerpt from the top matching chunks on this page (up to 1200 characters).'),
    citations: z.array(PublicSemanticSearchCitation).describe('Grounded citations backing this result.'),
  })
  .describe('A single semantic search result.');

export const PublicSemanticSearchAction = z
  .object({
    id: z.string().uuid().describe('Stable semantic search action identifier.'),
    feature: z.literal('semantic_search'),
    status: z
      .enum(['queued', 'running', 'succeeded', 'failed', 'expired'])
      .describe('Lifecycle status of the search action.'),
    createdAt: z.string().datetime().describe('Timestamp when the action was submitted (ISO 8601).'),
    startedAt: z.string().datetime().nullable().optional().describe('Timestamp when processing started (ISO 8601), or null.'),
    finishedAt: z.string().datetime().nullable().optional().describe('Timestamp when processing finished (ISO 8601), or null.'),
    expiresAt: z.string().datetime().describe('Timestamp when this action and its results expire (ISO 8601).'),
    pollUrl: z.string().optional().describe('API URL to poll for status and results.'),
    items: z.array(PublicSemanticSearchResultItem).optional().describe('Result items; empty until status is succeeded.'),
    error: z
      .object({
        code: z.string().optional().describe('Machine-readable error code, present when status is failed.'),
        message: z.string().optional().describe('Human-readable error message, present when status is failed.'),
      })
      .optional()
      .describe('Error detail, present only when status is failed.'),
    usage: z
      .object({
        inputTokens: z.number().optional().describe('Embedding input tokens consumed by this search, when reported by the provider.'),
        requestId: z.string().optional().describe('Provider request identifier, when reported.'),
      })
      .optional()
      .describe('Usage metadata, present only when status is succeeded.'),
  })
  .describe('Semantic wiki search action resource, returned on submit and poll.');

export const PublicLinkSource = z.enum(['markdown', 'wiki', 'frontmatter']).describe('How the link was discovered: a Markdown link, an Obsidian-style [[wikilink]], or a frontmatter related_pages entry.');

export const PublicOutboundLink = z
  .object({
    source: PublicLinkSource,
    targetPath: z.string().describe('Canonical path of the linked page.'),
    targetPageId: z.string().uuid().describe('Identifier of the linked page.'),
    targetStatus: z.enum(['draft', 'published', 'deleted']).describe('Lifecycle state of the linked page.'),
    linkText: z.string().describe('Visible label of the link.'),
  })
  .describe('An outbound link that resolves to a page the caller can read.');

export const PublicDanglingLink = z
  .object({
    source: PublicLinkSource,
    targetPath: z.string().describe('Path referenced by the link.'),
    targetStatus: z.enum(['draft', 'published', 'deleted']).optional().describe('Only present (as "deleted") when the target is a soft-deleted page visible to a caller with read_draft or admin access.'),
    linkText: z.string().describe('Visible label of the link.'),
  })
  .describe('A link whose target is unknown or unreadable to the caller.');

export const PublicExternalLink = z
  .object({
    source: z.literal('markdown'),
    href: z.string().describe('The https:// URL as written.'),
    linkText: z.string().describe('Visible label of the link.'),
  })
  .describe('An external (https://) Markdown link, not subject to the read-permission model.');

export const PublicOutboundLinksResponse = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the page whose outbound links are returned.'),
    links: z.array(PublicOutboundLink).describe('Links that resolve to a page the caller can read.'),
    dangling: z.array(PublicDanglingLink).describe('Links whose target is unknown or unreadable.'),
    external: z.array(PublicExternalLink).describe('https:// Markdown links.'),
  })
  .describe('Outbound link graph for a single page.');

export const PublicNeighborhoodQuery = z
  .object({
    node: z.string().uuid().describe('Root page identifier to traverse from.'),
    depth: z.coerce.number().int().min(1).max(3).optional().default(1).describe('Traversal depth bound (1-3). Defaults to 1.'),
    direction: z.enum(['out', 'in', 'both']).optional().default('out').describe('Which edges to follow. Defaults to out.'),
  })
  .describe('Public page neighborhood query parameters.');

export const PublicNeighborNode = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the neighboring page.'),
    path: PublicPagePath,
    title: z.string().describe('Title of the neighboring page.'),
    viaLinkSource: z
      .enum(['markdown', 'wiki', 'frontmatter', 'backlink'])
      .optional()
      .describe('How this page was reached from its parent tier; "backlink" only appears for direction=in|both.'),
  })
  .describe('A single node in a neighborhood tier.');

export const PublicNeighborhoodResponse = z
  .object({
    root: z
      .object({
        pageId: z.string().uuid(),
        path: z.string(),
        title: z.string(),
      })
      .describe('The root page the traversal started from.'),
    tiers: z.array(z.array(PublicNeighborNode)).describe('tiers[0] is the root (single-element array); tiers[1..depth] are each successive hop. A page appears at most once per tier.'),
  })
  .describe('Multi-hop page link neighborhood.');

export const PublicPageTreeNode: z.ZodType<{
  path: string;
  segment: string;
  title: string | null;
  pageId: string | null;
  slug: string | null;
  status: 'draft' | 'published' | 'deleted' | null;
  children: unknown[];
}> = z
  .object({
    path: z.string().describe('Full canonical path of this node (may be empty for the root).'),
    segment: z.string().describe('Last slash-separated segment of the path.'),
    title: z.string().nullable().describe('Page title when a page exists at this path, otherwise null.'),
    pageId: z.string().uuid().nullable().describe('Page id when a page exists at this path, otherwise null.'),
    slug: z.string().nullable().describe('Canonical public address (035) when a page exists at this path, otherwise null.'),
    status: z.enum(['draft', 'published', 'deleted']).nullable().describe('Page status when a page exists, otherwise null.'),
    children: z.array(z.lazy(() => PublicPageTreeNode)).describe('Child nodes ordered by path segment.'),
  })
  .describe('A single node in the public wiki page directory tree.');

export const PublicPageTreeQuery = z
  .object({
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .default('published')
      .describe('Filter pages by lifecycle state. Defaults to published.'),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to scope the tree to a subtree (e.g. "docs" returns only the docs/ branch).',
    ),
    space: z
      .string()
      .optional()
      .describe('Space slug to build the tree from. Defaults to the default wiki space.'),
    'filter[type]': z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Filter to pages whose frontmatter type matches this value.'),
    filterType: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('SDK-friendly alias for filter[type].'),
  })
  .describe('Public page tree query parameters.');

export const PublicPageTreeResponse = z
  .object({
    root: PublicPageTreeNode.describe('Root node of the directory tree. When pathPrefix is set, this is the prefix node.'),
    pageCount: z.number().int().nonnegative().describe('Total number of visible pages represented in the tree.'),
  })
  .describe('Hierarchical directory structure of public wiki pages.');

export const PublicPageBatchCreateInput = z
  .object({
    pages: z.array(PublicPageCreateInput).min(1).max(50).describe('Pages to create atomically (1-50).'),
  })
  .describe('Batch create public wiki pages.');

export const PublicBatchCreateResult = z
  .object({
    created: z.array(
      z.object({
        id: z.string().uuid().describe('Created page identifier.'),
        path: PublicPagePath.describe('Canonical path of the created page.'),
        title: z.string().describe('Title of the created page.'),
        revisionId: z.string().uuid().describe('Identifier of the initial draft revision.'),
        slug: z.string().describe('The public address the page was created at (defaults to path when not supplied).'),
        url: z.string().optional().describe('Full reader URL built from the slug.'),
      }),
    ),
    count: z.number().int().nonnegative().describe('Number of pages created.'),
  })
  .describe('Result of a batch page creation request.');

export const PublicBatchItemResult = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the page this result refers to.'),
    status: z.enum(['success', 'failed']).describe('Outcome of this item.'),
    revisionId: z.string().uuid().optional().describe('Identifier of the newly created revision, present on a successful non-dry-run update.'),
    preview: z.record(z.unknown()).optional().describe('Predicted new state, present on a dry_run=true request.'),
    error: z
      .object({
        code: z.string().describe('Public API error code for this item.'),
        message: z.string().describe('Human-readable error message.'),
      })
      .optional()
      .describe('Present when status is failed.'),
  })
  .describe('Per-item outcome of a batch operation.');

export const PublicPageBatchUpdateItemInput = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the page to update.'),
    title: z.string().min(1).max(200).optional().describe('New title.'),
    path: PublicPagePath.optional().describe('New canonical path.'),
    frontmatter: z
      .record(z.unknown().nullable())
      .optional()
      .describe('Partial frontmatter patch: keys present are written, null deletes the key, absent keys are preserved.'),
    baseRevisionId: z.string().uuid().describe('Expected current latest revision id, used for optimistic concurrency control.'),
  })
  .describe('A single batch update item.');

export const PublicPageBatchUpdateInput = z
  .object({
    items: z.array(PublicPageBatchUpdateItemInput).min(1).max(50).describe('Items to update (1-50). Not transactional across items.'),
  })
  .describe('Batch update public wiki pages.');

export const PublicPageBatchUpdateResult = z
  .object({
    results: z.array(PublicBatchItemResult).describe('Per-item outcomes, in request order.'),
    successCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    dryRun: z.boolean().optional().describe('Present and true when the request was made with ?dry_run=true.'),
  })
  .describe('Result of a batch page update request.');

export const PublicPageBatchDeleteInput = z
  .object({
    pageIds: z.array(z.string().uuid()).min(1).max(50).describe('Page identifiers to soft-delete (1-50). Not transactional across items.'),
  })
  .describe('Batch soft-delete public wiki pages.');

export const PublicPageBatchDeleteResult = z
  .object({
    results: z.array(PublicBatchItemResult).describe('Per-item outcomes, in request order.'),
    successCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    dryRun: z.boolean().optional().describe('Present and true when the request was made with ?dry_run=true.'),
  })
  .describe('Result of a batch page delete request.');

export const PublicBacklink = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the page containing the link.'),
    path: PublicPagePath.describe('Canonical path of the page containing the link.'),
    slug: z.string().describe('Canonical public address (035) of the page containing the link.'),
    title: z.string().describe('Title of the page containing the link.'),
    linkText: z.string().describe('Link text used in the Markdown link.'),
  })
  .describe('A single backlink to a target page.');

export const PublicBacklinksResponse = z
  .object({
    items: z.array(PublicBacklink).describe('Pages visible to the caller that link to the target page.'),
  })
  .describe('Backlinks response.');

export const PublicRevisionDiffQuery = z
  .object({
    against: z.coerce.number().int().min(1).describe('Earlier version number to diff against.'),
  })
  .describe('Revision diff query parameters.');

export const PublicRevisionDiffResponse = z
  .object({
    fromVersion: z.number().int().min(1).describe('Earlier revision version.'),
    toVersion: z.number().int().min(1).describe('Later revision version.'),
    diff: z.string().describe('Unified diff between the two revision sources.'),
    additions: z.number().int().nonnegative().describe('Number of added lines.'),
    deletions: z.number().int().nonnegative().describe('Number of removed lines.'),
  })
  .describe('Structured diff between two page revisions.');

export const PublicStatsQuery = z
  .object({
    include: z.enum(['orphans']).optional().describe('Optional additional report; "orphans" lists pages with zero inbound links.'),
    space: z.string().optional().describe('Space slug to report stats for. Defaults to the default wiki space.'),
  })
  .describe('Wiki stats query parameters.');

export const PublicStatsResponse = z
  .object({
    totalPages: z.number().int().nonnegative().describe('Total visible pages.'),
    publishedPages: z.number().int().nonnegative().describe('Published pages visible to the caller.'),
    draftPages: z.number().int().nonnegative().describe('Draft pages visible to the caller.'),
    deletedPages: z.number().int().nonnegative().describe('Soft-deleted pages visible to the caller.'),
    recentActivity: z.object({
      createdInLast7Days: z.number().int().nonnegative().describe('Pages created in the last 7 days.'),
      updatedInLast7Days: z.number().int().nonnegative().describe('Pages updated in the last 7 days.'),
    }),
    directories: z.array(z.object({ segment: z.string(), pageCount: z.number().int().nonnegative() })).describe('Top-level directory breakdown.'),
    orphans: z
      .array(z.object({ id: z.string().uuid(), path: z.string(), title: z.string() }))
      .optional()
      .describe('Pages with no inbound links, when include=orphans is requested.'),
  })
  .describe('Aggregate wiki statistics.');

export const PublicSimilarQuery = z
  .object({
    title: z.string().min(1).max(200).optional().describe('Proposed page title.'),
    path: PublicPagePath.optional().describe('Proposed page path.'),
    threshold: z.number().min(0).max(1).optional().describe('Minimum similarity score [0,1]; defaults to 0.5.'),
  })
  .refine((value) => value.title || value.path, { message: 'At least one of title or path must be provided' })
  .describe('Similar-page detection request.');

export const PublicSimilarResult = z
  .object({
    pageId: z.string().uuid().describe('Existing page identifier.'),
    path: z.string().describe('Existing page path.'),
    title: z.string().describe('Existing page title.'),
    score: z.number().min(0).max(1).describe('Similarity score in [0, 1].'),
  })
  .describe('A single similar-page candidate.');

export const PublicSimilarResponse = z
  .object({
    results: z.array(PublicSimilarResult).describe('Candidate similar pages sorted by score descending.'),
    threshold: z.number().min(0).max(1).describe('Threshold applied to the result set.'),
  })
  .describe('Similar-page detection response.');

export const PublicAssetResource = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
    contentType: PublicImageContentType.describe('MIME type of the stored asset.'),
    sizeBytes: z.number().int().nonnegative().describe('Size of the asset in bytes.'),
    url: z.string().describe('URL to fetch the asset content.'),
    markdown: z.string().describe('Ready-to-paste Markdown image snippet referencing this asset.'),
    createdAt: z.string().datetime().describe('Timestamp when the asset was created (ISO 8601).'),
  })
  .describe('Public wiki asset metadata.');

export const PublicAssetUploadResult = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
    contentType: PublicImageContentType.describe('MIME type of the uploaded asset.'),
    sizeBytes: z.number().int().nonnegative().describe('Size of the uploaded asset in bytes.'),
    url: z.string().describe('URL to fetch the uploaded asset content.'),
    markdown: z.string().describe('Ready-to-paste Markdown image snippet referencing the uploaded asset.'),
    createdAt: z.string().datetime().describe('Timestamp when the asset was created (ISO 8601).'),
  })
  .describe('Uploaded public wiki asset metadata.');

export const PublicImageGenerationSource = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('page').describe('Generate from the bound page revision.') }),
    z.object({
      kind: z.literal('selection'),
      text: z.string().min(1).max(100_000).describe('Selected text from the bound revision.'),
      hash: z.string().min(16).max(128).describe('Hash of the selected text used for source validation.'),
    }),
  ])
  .describe('Page-bound image source. Remote URLs, image bytes, and edit instructions are not accepted.');

export const PublicImageGenerationInput = z
  .object({
    pageId: z.string().uuid().describe('Page that owns the requested image action.'),
    revisionId: z.string().uuid().describe('Current editable revision used as the image source.'),
    source: PublicImageGenerationSource,
    aspectRatio: z
      .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
      .optional()
      .describe('Requested generated-image aspect ratio.'),
  })
  .describe('Asynchronous page-bound Wiki image generation request.');

export const PublicGeneratedImageArtifact = z
  .object({
    id: z.string().uuid().describe('Generated image artifact identifier.'),
    contentType: PublicImageContentType.describe('Generated image MIME type.'),
    sizeBytes: z.number().int().nonnegative().describe('Generated image size in bytes.'),
    expiresAt: z.string().datetime().describe('Timestamp when the unpromoted artifact expires (ISO 8601).'),
    previewUrl: z.string().describe('Private API URL that serves the generated image bytes.'),
    promoteUrl: z.string().describe('Private API URL that promotes the artifact to a normal Wiki asset.'),
    discardUrl: z.string().describe('Private API URL that discards the transient artifact.'),
  })
  .describe('Private generated-image artifact metadata. Image bytes are never embedded in JSON.');

export const PublicImageGeneration = z
  .object({
    id: z.string().uuid().describe('Stable image generation action identifier.'),
    feature: z.literal('image_generation'),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']).describe('Public image action lifecycle state.'),
    createdAt: z.string().datetime().describe('Timestamp when the action was submitted (ISO 8601).'),
    updatedAt: z.string().datetime().describe('Latest action lifecycle timestamp (ISO 8601).'),
    pollUrl: z.string().describe('Private API URL to poll for the action status.'),
    artifact: PublicGeneratedImageArtifact.optional().describe('Available only after successful generation.'),
    error: z
      .object({
        code: z.string().describe('Stable safe error code.'),
        message: z.string().describe('User-safe error message without provider diagnostics.'),
      })
      .optional()
      .describe('Available only when image generation fails.'),
  })
  .describe('Private image generation action resource.');

export const PublicGeneratedArtifactPromotionInput = z
  .object({ pageId: z.string().uuid().describe('Page bound to the generated image action.') })
  .describe('Promote a generated image artifact to a normal private Wiki asset.');

export const OkResponse = okResponseSchema;
export const PreviewInput = previewInputSchema;
export const PreviewOutput = previewOutputSchema;
export const RegisterOutput = registerOutputSchema;
export const ChangeEmailOutputSchema = changeEmailOutputSchema;
export const ProfileViewSchema = profileViewSchema;
export const UserIdParamSchema = userIdParamSchema;
export const ErrorResponse = errorResponseSchema;

// ---- First-run onboarding (021) ----------------------------------------------

export const SetupStateView = z
  .object({
    needed: z.boolean().describe('Whether first-run onboarding still has incomplete steps.'),
    currentStep: z
      .enum(['account', 'ai', 'writing_mode', 'sample_pages', 'summary', 'closed'])
      .describe('Current onboarding step.'),
    accountStatus: z.enum(['needed', 'created']).optional().describe('Initial Admin account status.'),
    aiStatus: z
      .enum(['not_started', 'skipped', 'queued', 'running', 'completed', 'partial', 'failed', 'disabled'])
      .optional()
      .describe('OpenRouter AI bootstrap status.'),
    samplePagesStatus: z
      .enum(['not_started', 'skipped', 'completed', 'partial', 'failed'])
      .optional()
      .describe('Sample/help page generation status.'),
    summary: z
      .object({
        adminCreated: z.boolean(),
        ai: z
          .object({
            wiki_text: z
              .object({
                status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
                modelId: z.string().uuid().optional(),
                modelName: z.string().optional(),
                reason: z.string().optional(),
              })
              .optional(),
            wiki_embedding: z
              .object({
                status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
                modelId: z.string().uuid().optional(),
                modelName: z.string().optional(),
                reason: z.string().optional(),
              })
              .optional(),
            wiki_image: z
              .object({
                status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
                modelId: z.string().uuid().optional(),
                modelName: z.string().optional(),
                reason: z.string().optional(),
              })
              .optional(),
          })
          .nullable()
          .describe('Per-purpose AI outcome; never contains credentials.'),
        samplePages: z
          .array(
            z.object({
              path: z.string(),
              status: z.enum(['created', 'updated', 'skipped', 'collision', 'failed']),
              pageId: z.string().uuid().optional(),
              reason: z.string().optional(),
            }),
          )
          .nullable()
          .describe('Per-page sample generation outcome.'),
      })
      .optional()
      .describe('Credential-free onboarding summary for the signed-in Admin.'),
  })
  .describe('First-run onboarding state. Anonymous callers only receive whether account setup is needed.');

export const SetupAiBootstrapInput = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('skip') }),
    z.object({
      mode: z.literal('configure'),
      apiKey: z.string().min(1).max(512).describe('Write-only OpenRouter API key.'),
      autoAssign: z.boolean().optional().default(true).describe('Automatically assign detected models to AI purposes.'),
    }),
  ])
  .describe('OpenRouter AI bootstrap choice.');

export const SetupWritingModeInput = z
  .object({
    mode: z.enum(['copilot', 'llm-wiki']).describe('Writing mode selected for this wiki.'),
  })
  .describe('First-run writing mode choice.');

export const SetupAiBootstrapResult = z
  .object({
    status: z.enum(['queued', 'completed', 'partial', 'failed', 'skipped', 'disabled']),
    actionId: z.string().uuid().optional().describe('AI action tracking the background model sync.'),
    pollUrl: z.string().optional().describe('URL to poll for setup state while queued.'),
    purposes: z
      .object({
        wiki_text: z
          .object({
            status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
            modelId: z.string().uuid().optional(),
            modelName: z.string().optional(),
            reason: z.string().optional(),
          })
          .optional(),
        wiki_embedding: z
          .object({
            status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
            modelId: z.string().uuid().optional(),
            modelName: z.string().optional(),
            reason: z.string().optional(),
          })
          .optional(),
        wiki_image: z
          .object({
            status: z.enum(['configured', 'skipped', 'unavailable', 'needs_manual_setup', 'failed']),
            modelId: z.string().uuid().optional(),
            modelName: z.string().optional(),
            reason: z.string().optional(),
          })
          .optional(),
      })
      .optional()
      .describe('Per-purpose outcome (wiki_text/wiki_embedding/wiki_image).'),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .optional(),
    nextStep: z.enum(['account', 'ai', 'writing_mode', 'sample_pages', 'summary', 'closed']).optional(),
  })
  .describe('OpenRouter AI bootstrap result. Never contains credentials.');

export const SetupSamplePagesInput = z
  .object({
    mode: z.enum(['skip', 'generate']).describe('Skip sample pages, or generate the example/help pages.'),
  })
  .describe('Sample/help page choice.');

export const SetupSamplePagesResult = z
  .object({
    status: z.enum(['not_started', 'skipped', 'completed', 'partial', 'failed']),
    pages: z
      .array(
        z.object({
          path: z.string(),
          status: z.enum(['created', 'updated', 'skipped', 'collision', 'failed']),
          pageId: z.string().uuid().optional(),
          reason: z.string().optional(),
        }),
      )
      .describe('Per-page generation outcome.'),
    nextStep: z.enum(['account', 'ai', 'writing_mode', 'sample_pages', 'summary', 'closed']).optional(),
  })
  .describe('Sample/help page generation result.');

export const WritingModeSettingsView = z
  .object({
    mode: z.enum(['copilot', 'llm-wiki']).describe('Active instance writing mode.'),
    pendingMode: z.enum(['copilot', 'llm-wiki']).nullable().describe('Target mode while a mode switch is in progress.'),
    switchJobId: z.string().uuid().nullable().describe('Background job handling the pending switch, or null.'),
  })
  .describe('Writing mode settings available to administrators.');

export const WritingModeSwitchInput = z
  .object({
    mode: z.enum(['copilot', 'llm-wiki']).describe('Target instance writing mode.'),
    rawVisibility: z.enum(['public', 'registered', 'restricted']).optional().describe('Required when returning to Copilot; visibility for moved raw pages.'),
    generatedVisibility: z.enum(['public', 'registered', 'restricted']).optional().describe('Required when returning to Copilot; visibility for moved generated pages.'),
  })
  .describe('Writing-mode transition request.');

export const WritingModeSwitchAccepted = z
  .object({ jobId: z.string().uuid().describe('Queued LLM Wiki to Copilot migration job.') })
  .describe('Accepted asynchronous writing-mode switch.');

export const WritingModeSwitchJobIdPathParams = z
  .object({ id: z.string().uuid().describe('Identifier of the writing-mode switch job.') })
  .describe('Path parameters for a writing-mode switch job.');

export const WritingModeSwitchJobView = z
  .object({
    jobId: z.string().uuid(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    report: z.record(z.unknown()).nullable(),
  })
  .describe('Writing-mode switch job status and completed migration report.');

// ---- Wiki AI Tool Runtime (026) --------------------------------------------
//
// Literal copies of the @next-wiki/shared ai-tools schemas (see the note at the
// top of this file). Named distinctly from their shared type counterparts to
// avoid the next-openapi-gen same-name resolution quirk documented above.

export const AiToolsListOutput = z
  .object({
    providers: z
      .array(
        z.object({
          key: z.string().describe('Stable provider key.'),
          displayName: z.string().describe('Admin-facing provider label.'),
          kind: z.enum(['builtin_wiki', 'external_mcp']).describe('Provider kind.'),
          enabled: z.boolean().describe('Whether the provider is enabled by Admin policy.'),
          activationStatus: z
            .enum(['available', 'disabled', 'unsupported', 'future_external'])
            .describe('Whether the provider can currently be activated.'),
        }),
      )
      .describe('Visible tool providers.'),
    tools: z
      .array(
        z.object({
          providerKey: z.string().describe('Owning provider key.'),
          name: z.string().describe('Stable MCP-compatible tool name.'),
          category: z
            .enum(['read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence', 'media'])
            .describe('Coarse capability category.'),
          riskLevel: z
            .enum(['read', 'draft_write', 'reviewed_write', 'immediate_write'])
            .describe('Mutation risk of the tool.'),
          requiredScope: z.string().describe('Permission/action needed to call the tool.'),
          enabled: z.boolean().describe('Whether the tool is currently enabled.'),
          reviewPolicy: z
            .enum(['always_review', 'review_when_requested', 'allow_immediate_for_owner'])
            .describe('Admin-managed review policy.'),
          resultRetention: z
            .enum(['conversation_summary', 'raw_when_durable', 'never_full_result'])
            .describe('How much of a result may be retained in Conversation records.'),
          effectiveReview: z
            .enum(['none', 'admin_review'])
            .describe('Effective review disposition after server policy resolution.'),
          description: z.string().nullable().optional().describe('Human-readable tool description.'),
        }),
      )
      .describe('Visible tools and their effective policies.'),
  })
  .describe('Admin listing of tool providers, tools, and effective policies.');

export const AiToolPolicyPatchInput = z
  .object({
    providerKey: z.string().min(1).max(100).describe('Provider whose policy is updated.'),
    category: z
      .enum(['read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence', 'media'])
      .nullable()
      .optional()
      .describe('Category-level policy target; null/omitted for provider default.'),
    toolName: z.string().min(1).max(200).nullable().optional().describe('Tool-specific policy target; null for category/provider default.'),
    enabled: z.boolean().optional().describe('Whether the tool/category can be used.'),
    reviewPolicy: z
      .enum(['always_review', 'review_when_requested', 'allow_immediate_for_owner'])
      .optional()
      .describe('New review policy. Cannot be set less restrictive than the system minimum.'),
    maxCallsPerTurn: z.number().int().min(1).max(100).optional().describe('Per-turn tool-call limit.'),
    timeoutMs: z.number().int().min(1000).max(120000).optional().describe('Per-call timeout in milliseconds.'),
  })
  .describe('Update Admin-managed policy for a provider, category, or tool.');

export const AiToolPolicyResource = z
  .object({
    id: z.string().uuid().describe('Policy identifier.'),
    providerKey: z.string().describe('Owning provider key.'),
    category: z
      .enum(['read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence', 'media'])
      .nullable()
      .describe('Category-level target, or null for provider/tool scope.'),
    toolName: z.string().nullable().describe('Tool-specific target, or null for category/provider scope.'),
    enabled: z.boolean().describe('Whether the tool/category can be used.'),
    reviewPolicy: z.enum(['always_review', 'review_when_requested', 'allow_immediate_for_owner']),
    maxCallsPerTurn: z.number().int(),
    timeoutMs: z.number().int(),
    updatedBy: z.string().uuid().nullable(),
    updatedAt: z.string().describe('Timestamp when the policy was last updated (ISO 8601).'),
  })
  .describe('An effective Admin tool policy resource.');

export const AiToolProposalIdPathParams = z
  .object({ id: z.string().uuid().describe('Tool change proposal identifier.') })
  .describe('Tool proposal ID path parameters.');

const aiToolProposalStatusEnum = z.enum(['pending', 'approved', 'rejected', 'applied', 'failed', 'superseded']);
const aiToolProposalKindEnum = z.enum(['tag_update', 'metadata_update', 'batch_update', 'raw_evidence_link', 'other']);

export const AiToolProposalsListOutput = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          kind: aiToolProposalKindEnum,
          status: aiToolProposalStatusEnum,
          title: z.string(),
          createdByUserId: z.string().uuid().nullable(),
          reviewedByUserId: z.string().uuid().nullable(),
          reviewedAt: z.string().nullable(),
          appliedAt: z.string().nullable(),
          createdAt: z.string(),
        }),
      )
      .describe('Proposal summaries for the current result window.'),
    total: z.number().int().nonnegative().describe('Total number of matching proposals.'),
  })
  .describe('Admin list of tool change proposals.');

export const AiToolProposalResource = z
  .object({
    id: z.string().uuid(),
    kind: aiToolProposalKindEnum,
    status: aiToolProposalStatusEnum,
    title: z.string(),
    rationale: z.string().describe('Assistant-provided reason for the change.'),
    requestedReview: z.enum(['none', 'admin_review']),
    effectiveReview: z.enum(['none', 'admin_review']),
    workflowId: z.string().uuid().nullable(),
    toolCallId: z.string().uuid().nullable(),
    sourceToolName: z.string().nullable(),
    createdByUserId: z.string().uuid().nullable(),
    reviewedByUserId: z.string().uuid().nullable(),
    reviewedAt: z.string().nullable(),
    appliedAt: z.string().nullable(),
    createdAt: z.string(),
    hasConflict: z.boolean().describe('Whether any item no longer matches its proposal base.'),
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          resourceKind: z.enum(['page', 'tag', 'page_metadata', 'raw_category', 'link']),
          resourceId: z.string().uuid().nullable(),
          resourceLabel: z.string().nullable(),
          beforeState: z.record(z.unknown()),
          afterState: z.record(z.unknown()),
          applyStatus: z.enum(['pending', 'applied', 'failed', 'skipped']),
          hasConflict: z.boolean(),
          errorCode: z.string().nullable(),
          errorMessage: z.string().nullable(),
        }),
      )
      .describe('Itemized before/after changes.'),
    evidenceLinks: z
      .array(
        z.object({
          id: z.string().uuid(),
          targetKind: z.enum(['page_revision', 'proposal', 'tag_mutation', 'metadata_change']),
          evidenceUrl: z.string().nullable().describe('Permission-filtered evidence link, or null.'),
          contentHash: z.string().nullable(),
        }),
      )
      .describe('Permission-filtered Raw evidence links.'),
  })
  .describe('Full tool change proposal detail.');

export const AiToolProposalDecisionBody = z
  .object({ note: z.string().max(2000).optional().describe('Optional reviewer note.') })
  .describe('Approve or reject a tool change proposal.');

export const AiToolProposalApplyOutput = z
  .object({
    proposalId: z.string().uuid(),
    status: aiToolProposalStatusEnum,
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          applyStatus: z.enum(['pending', 'applied', 'failed', 'skipped']),
          errorCode: z.string().nullable(),
          errorMessage: z.string().nullable(),
        }),
      )
      .describe('Per-item application results.'),
  })
  .describe('Result of applying an approved tool change proposal.');
