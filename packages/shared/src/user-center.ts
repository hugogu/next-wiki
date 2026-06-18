import { z } from 'zod';

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).nullable(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const changeEmailInputSchema = z.object({
  email: z.string().email(),
});
export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const themePreferenceSchema = z.enum(['light', 'dark', 'auto']);
export const localePreferenceSchema = z.enum(['en', 'zh']);

export const updatePreferencesInputSchema = z.object({
  theme: themePreferenceSchema.nullable().optional(),
  locale: localePreferenceSchema.nullable().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;

export const preferencesViewSchema = z.object({
  theme: themePreferenceSchema.nullable(),
  locale: localePreferenceSchema.nullable(),
});
export type PreferencesView = z.infer<typeof preferencesViewSchema>;
