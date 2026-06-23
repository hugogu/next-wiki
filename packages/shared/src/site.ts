import { z } from 'zod';

/**
 * Site identity & footer (006). See contracts/site-settings.md.
 */

export const updateSiteSettingsInputSchema = z.object({
  siteName: z.string().trim().min(1).max(100),
  footerCopyright: z.string().trim().max(200).nullish(),
  icpNumber: z.string().trim().max(200).nullish(),
  icpUrl: z.string().trim().url().max(500).nullish(),
  publicSecurityNumber: z.string().trim().max(200).nullish(),
  publicSecurityUrl: z.string().trim().url().max(500).nullish(),
});
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsInputSchema>;

export const filingViewSchema = z.object({
  number: z.string().nullable(),
  url: z.string().nullable(),
});

export const siteSettingsViewSchema = z.object({
  siteName: z.string(),
  iconUrl: z.string(),
  hasCustomIcon: z.boolean(),
  footerCopyright: z.string().nullable(),
  icp: filingViewSchema,
  publicSecurity: filingViewSchema,
});
export type SiteSettingsView = z.infer<typeof siteSettingsViewSchema>;
