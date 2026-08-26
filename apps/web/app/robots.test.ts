import { describe, expect, it, vi } from 'vitest';

const configModule = vi.hoisted(() => ({
  env: { APP_URL: 'https://wiki.example.test' },
}));

vi.mock('@/server/config', () => configModule);

import robots, { dynamic } from './robots';

describe('robots route', () => {
  it('opts out of static prerendering so APP_URL is read from the running container, not baked in at Docker build time', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('advertises the sitemap and host using the runtime APP_URL', () => {
    const result = robots();

    expect(result.sitemap).toBe('https://wiki.example.test/sitemap.xml');
    expect(result.host).toBe('https://wiki.example.test');
  });
});
