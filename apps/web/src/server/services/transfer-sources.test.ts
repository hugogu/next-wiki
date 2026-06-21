import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { decryptAiJson } from '@/server/crypto/ai-encryption';
import { buildUserCtx } from '@/server/permissions';
import * as sources from './transfer-sources';

let adminId: string;

beforeEach(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `transfer-source-${crypto.randomUUID()}@example.com`,
    passwordHash: 'TEST',
    role: 'admin',
  }).returning();
  adminId = admin!.id;
});

describe('transfer sources', () => {
  it('encrypts credentials and returns only a masked view', async () => {
    const view = await sources.create(buildUserCtx(adminId, 'admin'), {
      type: 'wikijs',
      name: 'Legacy',
      baseUrl: 'https://wiki.example.com/',
      apiToken: 'secret-token',
      allowPrivateNetwork: false,
      enabled: true,
    });
    expect(view).not.toHaveProperty('apiToken');
    expect(view.hasCredentials).toBe(true);
    const row = await db.query.transferSources.findFirst();
    expect(row?.credentialsEncrypted).not.toContain('secret-token');
    expect(decryptAiJson(row!.credentialsEncrypted)).toEqual({ apiToken: 'secret-token' });
  });
});
