import { z } from 'zod';

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

export const meOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'editor', 'reader']),
  displayName: z.string().nullable(),
});
export type MeOutput = z.infer<typeof meOutputSchema>;
