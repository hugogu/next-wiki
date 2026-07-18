import { afterEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => cache);

import { invalidatePublicLinkPaths } from './public-cache';

describe('invalidatePublicLinkPaths', () => {
  afterEach(() => {
    cache.revalidatePath.mockReset();
    vi.unstubAllEnvs();
  });

  it('revalidates each unique softlink path outside tests', () => {
    vi.stubEnv('NODE_ENV', 'production');

    invalidatePublicLinkPaths(['docs/payments', 'docs/payments', 'guides/runtime']);

    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cache.revalidatePath).toHaveBeenCalledWith('/docs/payments');
    expect(cache.revalidatePath).toHaveBeenCalledWith('/guides/runtime');
  });

  it('does not invoke Next cache APIs in the test environment', () => {
    vi.stubEnv('NODE_ENV', 'test');

    invalidatePublicLinkPaths(['docs/payments']);

    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
