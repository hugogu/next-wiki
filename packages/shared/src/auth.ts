import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'editor', 'reader']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const loginOutputSchema = z.object({
  userId: z.string(),
  mustResetPassword: z.boolean(),
});
export type LoginOutput = z.infer<typeof loginOutputSchema>;

export const meOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: userRoleSchema,
  displayName: z.string().nullable(),
});
export type MeOutput = z.infer<typeof meOutputSchema>;

export const setRoleInputSchema = z.object({
  role: userRoleSchema,
});
export type SetRoleInput = z.infer<typeof setRoleInputSchema>;

export const setStatusInputSchema = z.object({
  status: userStatusSchema,
});
export type SetStatusInput = z.infer<typeof setStatusInputSchema>;

export const resetPasswordInputSchema = z.object({
  tempPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const setMyPasswordInputSchema = z.object({
  newPassword: z.string().min(8).max(128),
});
export type SetMyPasswordInput = z.infer<typeof setMyPasswordInputSchema>;

export const setupInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type SetupInput = z.infer<typeof setupInputSchema>;
