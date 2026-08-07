import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@/server/errors';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const settings = vi.hoisted(() => ({
  getAttachmentSettings: vi.fn(),
  updateAttachmentSettings: vi.fn(),
}));
const storageConfig = vi.hoisted(() => ({ assertCanManageStorage: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/attachment-settings', () => settings);
vi.mock('@/server/services/storage-config', () => storageConfig);

import * as route from './route';

const view = {
  maxSizeBytes: 20 * 1024 * 1024,
  allowedCategories: ['image', 'video', 'document'],
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

describe('attachment settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor: { kind: 'user', userId: 'admin', role: 'admin' } });
    settings.getAttachmentSettings.mockResolvedValue(view);
    settings.updateAttachmentSettings.mockResolvedValue(view);
  });

  it('returns settings for an authorized admin caller', async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(view);
    expect(storageConfig.assertCanManageStorage).toHaveBeenCalledWith(expect.anything());
  });

  it('rejects GET before reading settings when the caller lacks manage_storage', async () => {
    storageConfig.assertCanManageStorage.mockImplementation(() => {
      throw new DomainError('FORBIDDEN', 'You do not have permission to manage storage');
    });

    const response = await route.GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'FORBIDDEN', message: 'You do not have permission to manage storage' });
    expect(settings.getAttachmentSettings).not.toHaveBeenCalled();
  });

  it('forwards a valid PATCH to the service', async () => {
    const response = await route.PATCH(new NextRequest('http://localhost/api/settings/attachments', {
      method: 'PATCH',
      body: JSON.stringify({ maxSizeBytes: 10 * 1024 * 1024, allowedCategories: ['image'] }),
    }));

    expect(response.status).toBe(200);
    expect(settings.updateAttachmentSettings).toHaveBeenCalledWith(expect.anything(), {
      maxSizeBytes: 10 * 1024 * 1024,
      allowedCategories: ['image'],
    });
  });

  it('keeps authorization failures from the service on PATCH', async () => {
    settings.updateAttachmentSettings.mockRejectedValue(new DomainError('FORBIDDEN', 'forbidden'));

    const response = await route.PATCH(new NextRequest('http://localhost/api/settings/attachments', {
      method: 'PATCH',
      body: JSON.stringify({ maxSizeBytes: 10 * 1024 * 1024, allowedCategories: ['image'] }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'FORBIDDEN', message: 'forbidden' });
  });
});
