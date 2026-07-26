import { z } from 'zod';

export const requestLogLevelSchema = z.enum(['status', 'header', 'all']);
export type RequestLogLevel = z.infer<typeof requestLogLevelSchema>;

export const outboundRequestOutcomeSchema = z.enum([
  'success',
  'http_error',
  'transport_error',
  'timeout',
  'cancelled',
  'invalid_response',
]);
export type OutboundRequestOutcome = z.infer<typeof outboundRequestOutcomeSchema>;

export const outboundRequestSourceSchema = z.object({
  sourceType: z.string().min(1).max(80),
  providerKey: z.string().min(1).max(200).optional(),
  operation: z.string().min(1).max(120),
  correlationId: z.string().min(1).max(200).optional(),
  attempt: z.number().int().positive().optional(),
});
export type OutboundRequestSource = z.infer<typeof outboundRequestSourceSchema>;

export const requestLogHeaderSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});
export type RequestLogHeader = z.infer<typeof requestLogHeaderSchema>;

export const requestLogBodySchema = z.object({
  encoding: z.enum(['utf8', 'base64']),
  contentType: z.string().nullable(),
  contentEncoding: z.string().nullable(),
  byteLength: z.number().int().nonnegative(),
  data: z.string(),
});
export type RequestLogBody = z.infer<typeof requestLogBodySchema>;

export const requestLogSettingsViewSchema = z.object({
  enabled: z.boolean(),
  level: requestLogLevelSchema,
  retentionHours: z.number().int().min(1).max(168),
  updatedAt: z.string().nullable(),
  updatedBy: z.object({ id: z.string(), email: z.string() }).nullable(),
  allConfirmationRequired: z.literal(true),
});
export type RequestLogSettingsView = z.infer<typeof requestLogSettingsViewSchema>;

export const updateRequestLogSettingsSchema = z
  .object({
    enabled: z.boolean(),
    level: requestLogLevelSchema,
    retentionHours: z.number().int().min(1).max(168),
    confirmSensitiveCapture: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.level === 'all' && value.confirmSensitiveCapture !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmSensitiveCapture'], message: 'Confirmation is required for All capture' });
    }
  });
export type UpdateRequestLogSettings = z.infer<typeof updateRequestLogSettingsSchema>;

export const requestLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  sourceType: z.string().min(1).max(80).optional(),
  providerKey: z.string().min(1).max(200).optional(),
  operation: z.string().min(1).max(120).optional(),
  outcome: outboundRequestOutcomeSchema.optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});
export type RequestLogListQuery = z.infer<typeof requestLogListQuerySchema>;

export const requestLogSummarySchema = z.object({
  id: z.string().uuid(),
  sourceType: z.string(),
  providerKey: z.string().nullable(),
  operation: z.string(),
  attempt: z.number().int(),
  method: z.string(),
  targetHost: z.string().nullable(),
  targetPath: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  outcome: outboundRequestOutcomeSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  providerRequestId: z.string().nullable(),
  correlationId: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  captureLevel: requestLogLevelSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export type RequestLogSummary = z.infer<typeof requestLogSummarySchema>;

export const requestLogListResponseSchema = z.object({
  entries: z.array(requestLogSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type RequestLogListResponse = z.infer<typeof requestLogListResponseSchema>;

export const requestLogDetailSchema = requestLogSummarySchema.extend({
  target: z.string().nullable(),
  requestHeaders: z.array(requestLogHeaderSchema).nullable(),
  responseHeaders: z.array(requestLogHeaderSchema).nullable(),
  requestBody: requestLogBodySchema.nullable(),
  responseBody: requestLogBodySchema.nullable(),
  errorDetail: z.record(z.unknown()).nullable(),
});
export type RequestLogDetail = z.infer<typeof requestLogDetailSchema>;

