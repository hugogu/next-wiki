import { z } from 'zod';

export const setupAccountStatusSchema = z.enum(['needed', 'created']);
export type SetupAccountStatus = z.infer<typeof setupAccountStatusSchema>;

export const setupAiStatusSchema = z.enum([
  'not_started',
  'skipped',
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'disabled',
]);
export type SetupAiStatus = z.infer<typeof setupAiStatusSchema>;

export const setupSamplePagesStatusSchema = z.enum([
  'not_started',
  'skipped',
  'completed',
  'partial',
  'failed',
]);
export type SetupSamplePagesStatus = z.infer<typeof setupSamplePagesStatusSchema>;

export const setupStepSchema = z.enum(['account', 'ai', 'writing_mode', 'sample_pages', 'summary', 'closed']);
export type SetupStep = z.infer<typeof setupStepSchema>;

export const writingModeSchema = z.enum(['copilot', 'llm-wiki']);
export type WritingMode = z.infer<typeof writingModeSchema>;

export const setupWritingModeInputSchema = z.object({
  mode: writingModeSchema,
});
export type SetupWritingModeInput = z.infer<typeof setupWritingModeInputSchema>;

export const setupPurposeResultStatusSchema = z.enum([
  'configured',
  'skipped',
  'unavailable',
  'needs_manual_setup',
  'failed',
]);
export type SetupPurposeResultStatus = z.infer<typeof setupPurposeResultStatusSchema>;

export const setupPurposeResultSchema = z.object({
  status: setupPurposeResultStatusSchema,
  modelId: z.string().uuid().optional(),
  modelName: z.string().optional(),
  reason: z.string().optional(),
});
export type SetupPurposeResult = z.infer<typeof setupPurposeResultSchema>;

export const setupAiPurposeKeySchema = z.enum(['wiki_text', 'wiki_embedding', 'wiki_image']);
export type SetupAiPurposeKey = z.infer<typeof setupAiPurposeKeySchema>;

export const setupAiResultSchema = z.object({
  wiki_text: setupPurposeResultSchema.optional(),
  wiki_embedding: setupPurposeResultSchema.optional(),
  wiki_image: setupPurposeResultSchema.optional(),
});
export type SetupAiResult = z.infer<typeof setupAiResultSchema>;

export const setupSamplePageStatusSchema = z.enum([
  'created',
  'updated',
  'skipped',
  'collision',
  'failed',
]);
export type SetupSamplePageStatus = z.infer<typeof setupSamplePageStatusSchema>;

export const setupSamplePageResultSchema = z.object({
  path: z.string(),
  status: setupSamplePageStatusSchema,
  pageId: z.string().uuid().optional(),
  reason: z.string().optional(),
});
export type SetupSamplePageResult = z.infer<typeof setupSamplePageResultSchema>;

export const setupSummarySchema = z.object({
  adminCreated: z.boolean(),
  ai: setupAiResultSchema.nullable(),
  samplePages: z.array(setupSamplePageResultSchema).nullable(),
});
export type SetupSummary = z.infer<typeof setupSummarySchema>;

export const setupStateViewSchema = z.object({
  needed: z.boolean(),
  currentStep: setupStepSchema,
  accountStatus: setupAccountStatusSchema.optional(),
  aiStatus: setupAiStatusSchema.optional(),
  samplePagesStatus: setupSamplePagesStatusSchema.optional(),
  summary: setupSummarySchema.optional(),
});
export type SetupStateView = z.infer<typeof setupStateViewSchema>;

export const setupAiBootstrapInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('skip') }),
  z.object({
    mode: z.literal('configure'),
    apiKey: z.string().min(1).max(512),
    autoAssign: z.boolean().optional().default(true),
  }),
]);
export type SetupAiBootstrapInput = z.infer<typeof setupAiBootstrapInputSchema>;

export const setupAiBootstrapResponseSchema = z.object({
  status: z.enum(['queued', 'completed', 'partial', 'failed', 'skipped', 'disabled']),
  actionId: z.string().uuid().optional(),
  pollUrl: z.string().optional(),
  purposes: setupAiResultSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  nextStep: setupStepSchema.optional(),
});
export type SetupAiBootstrapResponse = z.infer<typeof setupAiBootstrapResponseSchema>;

export const setupSamplePagesInputSchema = z.object({
  mode: z.enum(['skip', 'generate']),
});
export type SetupSamplePagesInput = z.infer<typeof setupSamplePagesInputSchema>;

export const setupSamplePagesResponseSchema = z.object({
  status: setupSamplePagesStatusSchema,
  pages: z.array(setupSamplePageResultSchema),
  nextStep: setupStepSchema.optional(),
});
export type SetupSamplePagesResponse = z.infer<typeof setupSamplePagesResponseSchema>;
