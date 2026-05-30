import { eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { getDb } from "@/server/db/client";
import { users, userIdentities, groups, groupMemberships, siteSettings } from "@/server/db/schema/auth";
import { isSetupComplete, markSetupComplete } from "./setup-service";
import { ValidationError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Initialize the wiki on first run.
 * Idempotent — safe to call multiple times.
 */
export async function initializeWiki(input: InitInput): Promise<InitResult> {
  // Step 1: already done?
  if (await isSetupComplete()) {
    return { adminUserId: "", alreadyInitialized: true };
  }

  // Step 2: validate
  validateInput(input);

  const db = getDb();

  // Step 3: check for existing user with this email (partial / interrupted run)
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.adminEmail))
    .limit(1);

  if (existing.length > 0) {
    // A previous interrupted run already created the user; mark complete and return.
    const adminUserId = existing[0].id;
    await markSetupComplete();
    return { adminUserId, alreadyInitialized: false };
  }

  // Step 4: create admin user directly in DB (better-auth stores password in user_identities)
  const passwordHash = await hash(input.adminPassword);
  const adminUserId = crypto.randomUUID();

  await db.insert(users).values({
    id: adminUserId,
    email: input.adminEmail,
    displayName: input.adminDisplayName.trim(),
    status: "active",
  });

  // Insert local identity with the argon2 hash as the external_subject / metadata
  await db.insert(userIdentities).values({
    id: crypto.randomUUID(),
    userId: adminUserId,
    providerType: "local",
    providerKey: input.adminEmail,
    externalSubject: input.adminEmail,
    metadata: { passwordHash },
  });

  // Step 5: ensure 'administrators' system group exists, then add membership
  const existingGroup = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.key, "administrators"))
    .limit(1);

  let adminGroupId: string;
  if (existingGroup.length > 0) {
    adminGroupId = existingGroup[0].id;
  } else {
    adminGroupId = crypto.randomUUID();
    await db.insert(groups).values({
      id: adminGroupId,
      key: "administrators",
      name: "Administrators",
      description: "Full site administration access",
      isSystem: true,
    }).onConflictDoNothing();
    // Re-fetch in case of a race / conflict
    const refetched = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.key, "administrators"))
      .limit(1);
    adminGroupId = refetched[0]?.id ?? adminGroupId;
  }

  await db.insert(groupMemberships).values({
    id: crypto.randomUUID(),
    userId: adminUserId,
    groupId: adminGroupId,
    role: "member",
  }).onConflictDoNothing();

  // Step 6: site name
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
        set: {
          value: input.siteName.trim(),
          updatedByUserId: adminUserId,
          updatedAt: new Date(),
        },
      });
  }

  // Step 7: mark setup complete
  await markSetupComplete();

  return { adminUserId, alreadyInitialized: false };
}
