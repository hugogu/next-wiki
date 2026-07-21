import { z } from 'zod';

/**
 * Web analytics provider integrations (024). Administrators enable/disable
 * built-in providers and store a per-provider Tracking ID. The active
 * providers' scripts are injected at the framework level (root layout) —
 * see `specs/024-analytics-integrations/contracts/script-injection.md`.
 *
 * New providers are registered by appending to `analyticsProviderSchema`
 * (here) and the mirrored DB pgEnum (`apps/web/src/server/db/schema/enums.ts`)
 * in the same commit.
 */

export const analyticsProviderSchema = z.enum(['baidu_tongji', 'google_analytics']);
export type AnalyticsProvider = z.infer<typeof analyticsProviderSchema>;

export const analyticsProviderItemSchema = z.object({
  provider: analyticsProviderSchema,
  label: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  trackingId: z.string().nullable(),
  trackingIdFormat: z.string(),
  updatedAt: z.string().nullable(),
});
export type AnalyticsProviderItem = z.infer<typeof analyticsProviderItemSchema>;

export const analyticsSettingsViewSchema = z.object({
  providers: z.array(analyticsProviderItemSchema),
  activeScriptContent: z.string(),
});
export type AnalyticsSettingsView = z.infer<typeof analyticsSettingsViewSchema>;

export const updateAnalyticsProviderInputSchema = z.object({
  provider: analyticsProviderSchema,
  enabled: z.boolean(),
  trackingId: z.string().trim().max(200).nullable(),
});
export type UpdateAnalyticsProviderInput = z.infer<typeof updateAnalyticsProviderInputSchema>;

export const updateAnalyticsSettingsInputSchema = z.object({
  providers: z.array(updateAnalyticsProviderInputSchema).min(1),
});
export type UpdateAnalyticsSettingsInput = z.infer<typeof updateAnalyticsSettingsInputSchema>;
