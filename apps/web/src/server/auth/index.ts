import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/server/db/client";
import { env } from "@/server/config/env";
import * as authSchema from "@/server/db/schema/auth";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: authSchema.users,
      session: authSchema.sessions,
      account: authSchema.accounts,  // uses dedicated accounts table with password field
    },
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute cookie cache
    },
  },

  user: {
    additionalFields: {
      avatarUrl: { type: "string", required: false },
      status: { type: "string", required: false, defaultValue: "active" },
      preferredLocale: { type: "string", required: false, defaultValue: "en" },
    },
  },

  advanced: {
    // Use UUID v4 so IDs match our uuid-typed primary key columns.
    generateId: () => crypto.randomUUID(),
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
