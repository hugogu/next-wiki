import { z, type ZodSchema, type ZodError } from 'zod';

export function parseJson<T>(schema: ZodSchema<T>, body: unknown): { ok: true; data: T } | { ok: false; error: ZodError } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: result.data };
}

export function parseParams<T>(schema: ZodSchema<T>, params: unknown): { ok: true; data: T } | { ok: false; error: ZodError } {
  const result = schema.safeParse(params);
  if (!result.success) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: result.data };
}

export function formatZodError(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const uuidSchema = z.string().uuid();
export const slugParamSchema = z.string().min(1).max(100);
export const versionParamSchema = z.coerce.number().int().min(1);
