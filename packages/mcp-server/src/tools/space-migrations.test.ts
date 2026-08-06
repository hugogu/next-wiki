import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { previewSpaceMigration, previewSpaceMigrationSchema, startSpaceMigration } from './space-migrations';
import type { WikiApiClient } from '../api-client';

describe('space migration MCP tools', () => {
  it('defaults preview adaptation and forwards confirmation', async () => {
    const client = {
      previewSpaceMigration: vi.fn().mockResolvedValue({ id: 'preview' }),
      startSpaceMigration: vi.fn().mockResolvedValue({ id: 'operation' }),
    } as unknown as WikiApiClient;
    await previewSpaceMigration(client, {
      selection: { kind: 'page', pageId: '33333333-3333-4333-8333-333333333333' },
      destinationSpaceId: '22222222-2222-4222-8222-222222222222',
    });
    await startSpaceMigration(client, { previewId: '33333333-3333-4333-8333-333333333333', fingerprint: 'a'.repeat(16) });
    expect(client.previewSpaceMigration).toHaveBeenCalledWith(expect.objectContaining({ adaptOkf: true }));
    expect(client.startSpaceMigration).toHaveBeenCalled();
  });

  it('matches REST path validation before sending a request', () => {
    expect(z.object(previewSpaceMigrationSchema).safeParse({
      selection: { kind: 'folder', sourceSpaceId: '11111111-1111-4111-8111-111111111111', pathPrefix: 'Invalid/Path' },
      destinationSpaceId: '22222222-2222-4222-8222-222222222222',
    }).success).toBe(false);
  });
});
