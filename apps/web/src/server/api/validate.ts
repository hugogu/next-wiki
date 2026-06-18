import { z, type ZodSchema, type ZodError, type ZodTypeDef } from 'zod';

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

export function parseQuery<TOutput, TInput = TOutput>(
  schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
  searchParams: URLSearchParams,
): { ok: true; data: TOutput } | { ok: false; error: ZodError } {
  const raw: Record<string, unknown> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
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
export const pathParamSchema = z.array(z.string().min(1)).min(1).max(20);
export const versionParamSchema = z.coerce.number().int().min(1);

export function getPathFromParams(params: { path: string[] }): string {
  return params.path.map((segment) => decodeURIComponent(segment)).join('/');
}
