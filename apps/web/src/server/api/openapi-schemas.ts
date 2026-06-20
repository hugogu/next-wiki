import { z } from 'zod';
import {
  apiKeyCreatedSchema,
  apiKeyRevealSchema,
  apiKeyScopeSchema,
  apiKeyViewSchema,
  auditEntrySchema,
  auditListResponseSchema,
  auditQueryParamsSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  createApiKeyInputSchema,
  createPageInputSchema,
  editableViewSchema,
  livePageSchema,
  loginInputSchema,
  loginOutputSchema,
  meOutputSchema,
  newDraftBodySchema,
  pageSummarySchema,
  preferencesViewSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  revisionInputSchema,
  revisionSummarySchema,
  revisionViewSchema,
  setMyPasswordInputSchema,
  setRoleInputSchema,
  setStatusInputSchema,
  setupInputSchema,
  updatePagePropertiesSchema,
  updatePreferencesInputSchema,
  updateProfileInputSchema,
  userViewSchema,
  assetUploadResultSchema,
  storageOverviewSchema,
  storageBackendViewSchema,
  storageBackendUpsertSchema,
  backendCheckSchema,
  backendCheckResultSchema,
  migrationViewSchema,
  migrationListSchema,
  migrationStartSchema,
  cleanupJobViewSchema,
  cleanupStartSchema,
  storageBackendDisableSchema,
  storageBackendEnableSchema,
  storageReadBackendSchema,
  replicaSyncStatusSchema,
} from '@next-wiki/shared';

export {
  apiKeyCreatedSchema,
  apiKeyRevealSchema,
  apiKeyScopeSchema,
  apiKeyViewSchema,
  auditEntrySchema,
  auditListResponseSchema,
  auditQueryParamsSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  createApiKeyInputSchema,
  createPageInputSchema,
  editableViewSchema,
  livePageSchema,
  loginInputSchema,
  loginOutputSchema,
  meOutputSchema,
  newDraftBodySchema,
  pageSummarySchema,
  preferencesViewSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  revisionInputSchema,
  revisionSummarySchema,
  revisionViewSchema,
  setMyPasswordInputSchema,
  setRoleInputSchema,
  setStatusInputSchema,
  setupInputSchema,
  updatePagePropertiesSchema,
  updatePreferencesInputSchema,
  updateProfileInputSchema,
  userViewSchema,
};

export const pageSummaryListSchema = z
  .array(pageSummarySchema)
  .describe('List of published page summaries');

export const revisionSummaryListSchema = z
  .array(revisionSummarySchema)
  .describe('List of revision summaries');

export const userViewListSchema = z.array(userViewSchema).describe('List of users');

export const okResponseSchema = z.object({ ok: z.boolean() }).describe('Simple OK response');

export const previewInputSchema = z
  .object({ contentSource: z.string() })
  .describe('Markdown preview input');

export const previewOutputSchema = z
  .object({ html: z.string() })
  .describe('Rendered HTML output');

export const registerOutputSchema = z
  .object({ userId: z.string() })
  .describe('Registration response');

export const changeEmailOutputSchema = z
  .object({ id: z.string(), email: z.string() })
  .describe('Changed email response');

export const profileViewSchema = z
  .object({ id: z.string(), email: z.string(), displayName: z.string().nullable() })
  .describe('Profile view');

export const userIdParamSchema = z.object({ id: z.string().uuid() }).describe('User ID path parameter');

export const pagePathParamSchema = z.object({ path: z.string() }).describe('Page path parameter');

export const revisionPathParamSchema = z
  .object({ path: z.string(), n: z.string() })
  .describe('Revision path and version parameters');

export const apiKeyViewListSchema = z.array(apiKeyViewSchema).describe('List of API keys');

export const errorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
  })
  .describe('API error response');

export const AssetUploadResult = assetUploadResultSchema;
export const StorageOverview = storageOverviewSchema;
export const StorageBackendView = storageBackendViewSchema;
export const StorageBackendUpsert = storageBackendUpsertSchema;
export const BackendCheckInput = backendCheckSchema;
export const BackendCheckResult = backendCheckResultSchema;
export const MigrationView = migrationViewSchema;
export const MigrationList = migrationListSchema;
export const MigrationStartInput = migrationStartSchema;
export const CleanupJobView = cleanupJobViewSchema;
export const CleanupStartInput = cleanupStartSchema;
export const StorageBackendDisable = storageBackendDisableSchema;
export const StorageBackendEnable = storageBackendEnableSchema;
export const StorageReadBackend = storageReadBackendSchema;
export const ReplicaSyncStatus = replicaSyncStatusSchema;

export const ApiKeyViewList = apiKeyViewListSchema;
export const CreateApiKeyInput = createApiKeyInputSchema;
export const ApiKeyCreated = apiKeyCreatedSchema;
export const ApiKeyReveal = apiKeyRevealSchema;
export const AuditListResponse = auditListResponseSchema;

export const PageSummaryList = pageSummaryListSchema;
export const RevisionSummaryList = revisionSummaryListSchema;
export const UserViewList = userViewListSchema;
export const OkResponse = okResponseSchema;
export const PreviewInput = previewInputSchema;
export const PreviewOutput = previewOutputSchema;
export const RegisterOutput = registerOutputSchema;
export const ChangeEmailOutputSchema = changeEmailOutputSchema;
export const ProfileViewSchema = profileViewSchema;
export const UserIdParamSchema = userIdParamSchema;
export const PagePathParamSchema = pagePathParamSchema;
export const RevisionPathParamSchema = revisionPathParamSchema;
export const ErrorResponse = errorResponseSchema;
