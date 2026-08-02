import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  configureIntegration,
  deleteIntegration,
  findIntegration,
  getIntegration,
  resolveCredential,
} from './integrations';

/**
 * A credential identifies an account, and every feature reaching that account
 * uses the same one. These tests pin that shape: one row per service, never
 * returned to a client, and not removable while something depends on it.
 */

let adminCtx: PermCtx;
let editorCtx: PermCtx;
let adminKeyCtx: PermCtx;

const TOKEN = 'ghp_super_secret_token_value';

beforeAll(async () => {
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
  await db.delete(schema.users);
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'int-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'int-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
  adminKeyCtx = buildApiKeyCtx(admin!.id, 'admin', ['storage', 'transfers'], randomUUID());
});

afterEach(async () => {
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('permissions', () => {
  it('denies editors', async () => {
    await expect(getIntegration(editorCtx, 'github')).rejects.toThrow(DomainError);
  });

  it('denies API keys, however broadly scoped', async () => {
    // A credential that can push to the wiki's repositories is as consequential
    // as the features that use it.
    await expect(getIntegration(adminKeyCtx, 'github')).rejects.toThrow(DomainError);
  });
});

describe('configureIntegration', () => {
  it('never returns the secret', async () => {
    const view = await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      username: 'x-access-token',
      secret: TOKEN,
    });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view.hasSecret).toBe(true);
  });

  it('stores the secret encrypted', async () => {
    await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      secret: TOKEN,
    });
    const row = await findIntegration('github');
    expect(row?.secretEncrypted).toBeTruthy();
    expect(row?.secretEncrypted).not.toContain(TOKEN);
  });

  it('keeps exactly one row per service', async () => {
    // A credential identifies an account, and a deployment has one account per
    // service — a second row would reintroduce the ambiguity this replaces.
    await configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh', secret: 'KEY_ONE' });
    await configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh', secret: 'KEY_TWO' });
    const rows = await db.query.integrations.findMany();
    expect(rows).toHaveLength(1);
  });

  it('keeps the stored secret when an update omits it', async () => {
    await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      secret: TOKEN,
    });
    const before = (await findIntegration('github'))?.secretEncrypted;
    await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      label: 'renamed',
    });
    expect((await findIntegration('github'))?.secretEncrypted).toBe(before);
  });

  it('refuses an auth-mode switch without a new credential', async () => {
    // An HTTPS token cannot authenticate an SSH remote; silently keeping it
    // would fail at push time instead of here.
    await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      secret: TOKEN,
    });
    await expect(
      configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh' }),
    ).rejects.toThrow(DomainError);
  });

  it('requires a credential on first connect', async () => {
    await expect(
      configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh' }),
    ).rejects.toThrow(DomainError);
  });
});

describe('resolveCredential', () => {
  it('returns the decrypted credential for a job', async () => {
    await configureIntegration(adminCtx, {
      kind: 'github',
      authMode: 'https_token',
      username: 'octocat',
      secret: TOKEN,
    });
    await expect(resolveCredential('github')).resolves.toEqual({
      authMode: 'https_token',
      username: 'octocat',
      secret: TOKEN,
    });
  });

  it('returns null when the service is not connected', async () => {
    await expect(resolveCredential('github')).resolves.toBeNull();
  });
});

describe('deleteIntegration', () => {
  it('removes a credential nothing depends on', async () => {
    await configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh', secret: 'KEY' });
    await deleteIntegration(adminCtx, 'github');
    expect(await findIntegration('github')).toBeUndefined();
  });

  it('refuses while a feature still points at it', async () => {
    // Silently breaking publishing would be worse than making the operator
    // disconnect it deliberately.
    await configureIntegration(adminCtx, { kind: 'github', authMode: 'ssh', secret: 'KEY' });
    const integration = await findIntegration('github');
    await db.insert(schema.staticSiteTargets).values({
      remoteUrl: 'https://github.com/owner/site.git',
      branch: 'gh-pages',
      baseUrl: 'https://owner.github.io/site/',
      integrationId: integration!.id,
    });

    await expect(deleteIntegration(adminCtx, 'github')).rejects.toThrow(DomainError);
    expect(await findIntegration('github')).toBeDefined();
  });
});
