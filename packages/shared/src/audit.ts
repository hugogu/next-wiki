import { z } from 'zod';

export const authStatusSchema = z.enum([
  'authenticated',
  'invalid_key',
  'revoked_key',
  'disabled_user',
  'malformed_token',
]);
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  keyId: z.string().nullable(),
  keyName: z.string().nullable(),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number(),
  durationMs: z.number(),
  authStatus: authStatusSchema,
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyId: z.string().uuid().optional(),
  status: z.enum(['success', 'error']).optional(),
  userId: z.string().uuid().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});
export type AuditQueryParams = z.infer<typeof auditQueryParamsSchema>;

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
