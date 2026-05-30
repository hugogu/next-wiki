import { z } from "zod";

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
  });

// Cursor pagination (preferred for large datasets)
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

// Common ID param
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

// Sort direction
export const sortDirectionSchema = z.enum(["asc", "desc"]).default("asc");

// Locale
export const localeSchema = z.string().min(2).max(10).default("en");

// API response envelope
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.array(z.string())).optional(),
  }),
});

// Job/task reference
export const jobRefSchema = z.object({
  jobId: z.string(),
  taskId: z.string().uuid().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
export type JobRef = z.infer<typeof jobRefSchema>;
