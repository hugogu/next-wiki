import { z } from 'zod';

const secretRefSchema = z.union([
  z.string().min(1),
  z.object({ value: z.string().min(1) }).passthrough(),
  z.object({ ref: z.string().min(1) }).passthrough(),
]);

export const bridgeConfigSchema = z.object({
  wikiApiBaseUrl: z.string().url(),
  credential: secretRefSchema,
  capture: z.object({
    enabled: z.boolean().default(false),
    beforeCompaction: z.boolean().default(false),
    sessionEnd: z.boolean().default(false),
    agentEnd: z.boolean().default(false),
  }).default({}),
  externalContext: z.object({
    enabled: z.boolean().default(false),
    maxResults: z.number().int().min(1).max(10).default(3),
    maxCharacters: z.number().int().min(100).max(20_000).default(6_000),
  }).default({}),
  outbox: z.object({
    maxEntries: z.number().int().min(1).max(10_000).default(1_000),
    maxBytes: z.number().int().min(4_096).max(104_857_600).default(52_428_800),
    maxAgeSeconds: z.number().int().min(60).max(2_592_000).default(604_800),
  }).default({}),
}).strict();

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;

export function parseBridgeConfig(value: unknown): BridgeConfig {
  const parsed = bridgeConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid next-wiki memory bridge configuration');
  return parsed.data;
}

export function resolveCredential(credential: BridgeConfig['credential']): string {
  if (typeof credential === 'string') return credential;
  if ('value' in credential && typeof credential.value === 'string') return credential.value;
  throw new Error('OpenClaw must resolve the configured credential SecretRef before starting the bridge');
}
