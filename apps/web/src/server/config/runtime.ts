import { env } from "./env";

export const runtime = {
  isDevelopment: env.NODE_ENV === "development",
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",

  database: {
    url: env.DATABASE_URL,
  },

  auth: {
    secret: env.BETTER_AUTH_SECRET,
    url: env.BETTER_AUTH_URL,
  },

  encryption: {
    key: env.ENCRYPTION_KEY,
  },

  app: {
    url: env.NEXT_PUBLIC_APP_URL,
    assetStoragePath: env.ASSET_STORAGE_PATH,
  },

  ai: {
    enabled: Boolean(env.LLM_PROVIDER && env.LLM_API_KEY),
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL || undefined,
  },

  logging: {
    level: env.LOG_LEVEL,
  },
} as const;
