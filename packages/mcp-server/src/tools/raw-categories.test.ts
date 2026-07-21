import { describe, expect, it, vi } from 'vitest';
import type { WikiApiClient } from '../api-client';
import { listRawCategories } from './list-raw-categories';
import { createRawCategory } from './create-raw-category';

const CATEGORY = {
  id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Reference', slug: 'reference', description: 'default', isDefault: true, isRetired: false,
  systemKey: null, isSystem: false,
  entryCount: 3, createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
};

const CONVERSATION_CATEGORY = {
  id: 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  name: 'Conversation', slug: 'conversation', description: null, isDefault: false, isRetired: false,
  systemKey: 'conversation', isSystem: true,
  entryCount: 12, createdAt: '2026-07-21T00:00:00.000Z', updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('raw category tools', () => {
  it('list_raw_categories flattens the taxonomy with entry counts', async () => {
    const client = { listRawCategories: vi.fn().mockResolvedValue({ items: [CATEGORY] }) } as unknown as WikiApiClient;
    const result = await listRawCategories(client);
    expect(result).toEqual({
      categories: [{
        id: CATEGORY.id, name: 'Reference', slug: 'reference', description: 'default',
        isDefault: true, isRetired: false, systemKey: null, isSystem: false, entryCount: 3,
      }],
    });
  });

  it('list_raw_categories surfaces systemKey/isSystem for the built-in Conversation category (023)', async () => {
    const client = { listRawCategories: vi.fn().mockResolvedValue({ items: [CATEGORY, CONVERSATION_CATEGORY] }) } as unknown as WikiApiClient;
    const result = await listRawCategories(client);
    expect(result.categories).toContainEqual(expect.objectContaining({
      id: CONVERSATION_CATEGORY.id, systemKey: 'conversation', isSystem: true,
    }));
    expect(result.categories.find((c) => c.id === CATEGORY.id)).toMatchObject({ systemKey: null, isSystem: false });
  });

  it('create_raw_category forwards the input and flattens the created category', async () => {
    const createMock = vi.fn().mockResolvedValue({ ...CATEGORY, name: 'Incidents', slug: 'incidents', isDefault: false, entryCount: 0 });
    const client = { createRawCategory: createMock } as unknown as WikiApiClient;
    const result = await createRawCategory(client, { name: 'Incidents', slug: 'incidents' });
    expect(createMock).toHaveBeenCalledWith({ name: 'Incidents', slug: 'incidents', description: undefined, isDefault: undefined });
    expect(result).toMatchObject({ name: 'Incidents', slug: 'incidents', isDefault: false, entryCount: 0, isSystem: false });
  });
});
