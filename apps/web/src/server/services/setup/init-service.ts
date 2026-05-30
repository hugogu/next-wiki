import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users, groups, groupMemberships, siteSettings } from "@/server/db/schema/auth";
import { isSetupComplete, markSetupComplete } from "./setup-service";
import { ValidationError } from "@next-wiki/shared";

export type InitInput = {
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
  siteName?: string;
};

export type InitResult = {
  adminUserId: string;
  alreadyInitialized: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(input: InitInput): void {
  if (!EMAIL_RE.test(input.adminEmail)) {
    throw new ValidationError("Invalid email address", { adminEmail: ["Must be a valid email address"] });
  }
  if (input.adminPassword.length < 8) {
    throw new ValidationError("Password too short", { adminPassword: ["Password must be at least 8 characters"] });
  }
  if (!input.adminDisplayName.trim()) {
    throw new ValidationError("Display name is required", { adminDisplayName: ["Display name must not be empty"] });
  }
}

/**
 * Initialize the wiki on first run. Idempotent — safe to call multiple times.
 * Uses Better Auth's sign-up API so credentials are stored in the format
 * Better Auth expects (accounts table with argon2-hashed password).
 */
export async function initializeWiki(input: InitInput): Promise<InitResult> {
  if (await isSetupComplete()) {
    return { adminUserId: "", alreadyInitialized: true };
  }

  validateInput(input);

  const db = getDb();

  // Check for existing user (handles partial / interrupted run).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.adminEmail))
    .limit(1);

  let adminUserId: string;

  if (existing.length > 0 && existing[0]) {
    adminUserId = existing[0].id;
  } else {
    // Use Better Auth's sign-up API — it handles password hashing and
    // creates the correct account record in the accounts table.
    const { auth } = await import("@/server/auth/index");
    const result = await auth.api.signUpEmail({
      body: {
        email: input.adminEmail,
        password: input.adminPassword,
        name: input.adminDisplayName.trim(),
      },
    });

    if (!result?.user?.id) {
      throw new Error("Better Auth sign-up did not return a user ID");
    }

    adminUserId = result.user.id;

    // Sync name into our extended users table (Better Auth stores `name`).
    await db
      .update(users)
      .set({ name: input.adminDisplayName.trim() })
      .where(eq(users.id, adminUserId));
  }

  // Ensure 'administrators' system group exists and add user to it.
  const existingGroup = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.key, "administrators"))
    .limit(1);

  let adminGroupId: string;
  if (existingGroup.length > 0 && existingGroup[0]) {
    adminGroupId = existingGroup[0].id;
  } else {
    adminGroupId = crypto.randomUUID();
    await db
      .insert(groups)
      .values({
        id: adminGroupId,
        key: "administrators",
        name: "Administrators",
        description: "Full site administration access",
        isSystem: true,
      })
      .onConflictDoNothing();

    const refetched = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.key, "administrators"))
      .limit(1);
    adminGroupId = refetched[0]?.id ?? adminGroupId;
  }

  await db
    .insert(groupMemberships)
    .values({ id: crypto.randomUUID(), userId: adminUserId, groupId: adminGroupId, role: "member" })
    .onConflictDoNothing();

  // Persist site name if provided.
  if (input.siteName?.trim()) {
    await db
      .insert(siteSettings)
      .values({
        id: crypto.randomUUID(),
        key: "site.name",
        value: input.siteName.trim(),
        valueType: "string",
        updatedByUserId: adminUserId,
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: input.siteName.trim(), updatedByUserId: adminUserId, updatedAt: new Date() },
      });
  }

  await markSetupComplete();
  return { adminUserId, alreadyInitialized: false };
}
