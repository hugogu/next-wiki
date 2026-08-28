import { z } from 'zod';

export const migrateConfigSchema = z.object({
  wikiApiBaseUrl: z.string().url(),
  credential: z.union([z.string().min(1), z.object({ value: z.string().min(1) }).passthrough()]),
}).strict();

export type MigrateConfig = z.infer<typeof migrateConfigSchema>;

export function parseMigrateConfig(value: unknown): MigrateConfig {
  const parsed = migrateConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid next-wiki memory migration configuration');
  return parsed.data;
}

export function credentialValue(value: MigrateConfig['credential']): string {
  return typeof value === 'string' ? value : value.value;
}
